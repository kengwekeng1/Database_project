import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, getAuth, GoogleAuthProvider,
  inMemoryPersistence, setPersistence, signInWithEmailAndPassword, signInWithPopup, signOut,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';

const messages = {
  'auth/email-already-in-use': 'อีเมลนี้ถูกใช้แล้ว กรุณาเข้าสู่ระบบหรือใช้อีเมลอื่น',
  'auth/weak-password': 'กรุณาตั้งรหัสผ่านที่รัดกุมขึ้น',
  'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/popup-closed-by-user': 'ปิดหน้าต่าง Google แล้ว ลองเข้าสู่ระบบอีกครั้งได้',
  'auth/popup-blocked': 'เบราว์เซอร์บล็อกหน้าต่าง Google กรุณาอนุญาตให้เปิดป๊อปอัป',
  'auth/unauthorized-domain': 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication',
  'auth/account-exists-with-different-credential': 'อีเมลนี้ใช้วิธีเข้าสู่ระบบอื่นอยู่ กรุณาใช้วิธีเดิม',
};

export async function createFirebaseLogin(config, emulatorUrl, exchangeToken) {
  const auth = getAuth(initializeApp(config));
  if (emulatorUrl) connectAuthEmulator(auth, emulatorUrl);
  await setPersistence(auth, inMemoryPersistence);

  async function withFirebaseSession(signIn, registering = false) {
    try {
      const user = await signIn();
      try {
        return await exchangeToken(await user.getIdToken());
      } catch (error) {
        if (registering && ['USERNAME_TAKEN', 'EMAIL_TAKEN'].includes(error.code)) {
          await deleteUser(user);
        }
        throw error;
      }
    } finally {
      if (auth.currentUser) await signOut(auth);
    }
  }

  return {
    email: ({ email, password, username }, registering) => withFirebaseSession(async () => {
      if (!registering) return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
      const displayName = username?.trim();
      if (!displayName) throw new Error('กรุณากรอกชื่อผู้ใช้');
      if (password.length < 8) throw new Error('กรุณาตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร');
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(user, { displayName });
      await user.getIdToken(true);
      return user;
    }, registering),
    google: () => withFirebaseSession(async () => (await signInWithPopup(auth, new GoogleAuthProvider())).user),
    messageFor: (error) => messages[error.code],
  };
}
