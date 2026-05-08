import { getAuth, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { app } from "./firebase";

const auth = getAuth(app);
// Emulator setup would go here if needed

export { auth };

// Returns whether a user is currently logged in
export function isUserSignedIn() {
  const user = auth.currentUser;
  return user !== null;
}

// Creates a new user account with email and password
export function signUpWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      return userCredential.user;
    });
}

// Signs in the user with their Google account
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

// Notifies the callback with the current user
export function observeAuthState(callback) {
  callback(auth.currentUser);
}
