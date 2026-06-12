import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, getGenerativeModel } from "firebase/ai";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize App Check to secure the endpoint without a login wall
try {
  const recaptchaKey = ((import.meta as any).env)?.VITE_RECAPTCHA_KEY || "YOUR_RECAPTCHA_KEY_FROM_STEP_3";
  if (recaptchaKey && recaptchaKey !== "YOUR_RECAPTCHA_KEY_FROM_STEP_3") {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaKey),
      isTokenAutoRefreshEnabled: true
    });
    console.log("App Check initialized successfully with ReCaptcha Enterprise.");
  } else {
    console.warn("App Check not fully initialized: Please set VITE_RECAPTCHA_KEY in your environment, or edit src/firebase.ts manually.");
  }
} catch (appCheckError) {
  console.warn("Failed to initialize App Check (often expected in sandbox/iframe environment):", appCheckError);
}

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();
export const googleProvider = new GoogleAuthProvider();

/**
 * Generates AI content using the client-side Vertex AI in Firebase SDK.
 * Automatically handles anonymous authentication if the user is not currently signed in.
 */
export async function generateAIContent(promptText: string): Promise<string> {
  try {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
      console.log("Signed in anonymously for Vertex AI Firebase execution.");
    }

    const vertexAI = getAI(app);
    const model = getGenerativeModel(vertexAI, { model: "gemini-1.5-flash" });

    console.log("Generating Vertex AI content with prompt:", promptText);
    const result = await model.generateContent(promptText);
    const responseText = result.response.text();
    console.log("Vertex AI Firebase Response:", responseText);
    return responseText;
  } catch (error) {
    console.error("Vertex AI Firebase content generation failed:", error);
    throw error;
  }
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Firestore base connection verified successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firestore appears offline. Please check your network or Firebase project configs.");
    }
  }
}

// Perform baseline connection verification on module load and export
testConnection();
