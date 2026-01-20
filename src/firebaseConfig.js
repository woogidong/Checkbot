// Firebase 초기화 및 공통 설정
// .env 파일에 저장된 환경변수를 사용합니다.
// 예시:
// VITE_FIREBASE_API_KEY=...
// VITE_FIREBASE_AUTH_DOMAIN=...
// VITE_FIREBASE_PROJECT_ID=...
// VITE_FIREBASE_STORAGE_BUCKET=...
// VITE_FIREBASE_MESSAGING_SENDER_ID=...
// VITE_FIREBASE_APP_ID=...

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// 필수 값이 없는지 간단히 체크
if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  console.error(
    '❌ Firebase 설정값이 올바르게 세팅되지 않았습니다. .env 파일에서 VITE_FIREBASE_* 값을 확인해 주세요.'
  )
  console.error('현재 설정:', {
    apiKey: firebaseConfig.apiKey ? '설정됨' : '누락',
    projectId: firebaseConfig.projectId ? '설정됨' : '누락',
    appId: firebaseConfig.appId ? '설정됨' : '누락',
  })
}

let app, auth, provider, db

try {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  provider = new GoogleAuthProvider()
  db = getFirestore(app)
  
  console.log('✅ Firebase 초기화 완료')
} catch (error) {
  console.error('❌ Firebase 초기화 실패:', error)
  throw error
}

export { app, auth, provider, db }

