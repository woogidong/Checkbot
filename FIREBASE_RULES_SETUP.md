# Firebase 규칙 설정 가이드

이 문서는 Firestore Database와 Storage 규칙을 설정하는 방법을 안내합니다.

## 📋 요구사항

1. **Google 로그인한 사용자**: 자신의 좌석 사용 기록을 Database와 Storage에 저장할 수 있음
2. **모든 사람**: 현재 좌석 이용 정보를 모두 볼 수 있음 (로그인 여부 무관)
3. **관리자**: 지정한 UID로 로그인한 경우 모든 데이터를 볼 수 있고 삭제도 할 수 있음

## 🔧 설정 방법

### 1. 관리자 UID 확인

1. Firebase 콘솔에 접속: https://console.firebase.google.com
2. 프로젝트 선택
3. 왼쪽 메뉴에서 **Authentication** 클릭
4. **Users** 탭에서 관리자로 지정할 사용자의 UID를 복사

### 2. Firestore 규칙 설정

1. Firebase 콘솔에서 **Firestore Database** 클릭
2. **Rules** 탭 클릭
3. `firestore.rules` 파일의 내용을 복사하여 붙여넣기
4. `YOUR_ADMIN_UID_1`, `YOUR_ADMIN_UID_2` 부분을 실제 관리자 UID로 변경
5. **Publish** 버튼 클릭

**예시:**
```javascript
function isAdmin() {
  return request.auth != null && 
         request.auth.uid in [
           'abc123def456ghi789',  // 관리자 1의 UID
           'xyz789uvw456rst123'   // 관리자 2의 UID
         ];
}
```

### 3. Storage 규칙 설정

1. Firebase 콘솔에서 **Storage** 클릭
2. **Rules** 탭 클릭
3. `storage.rules` 파일의 내용을 복사하여 붙여넣기
4. `YOUR_ADMIN_UID_1`, `YOUR_ADMIN_UID_2` 부분을 실제 관리자 UID로 변경 (Firestore와 동일하게)
5. **Publish** 버튼 클릭

### 4. 규칙 테스트 (선택사항)

Firebase 콘솔의 Rules 탭에서 **Rules Playground**를 사용하여 규칙을 테스트할 수 있습니다.

## 📝 규칙 설명

### Firestore 규칙 (`firestore.rules`)

- **`seatUsages` 컬렉션**:
  - 읽기: 모든 사람 가능 (`allow read: if true`)
  - 생성: 로그인한 사용자만 가능 (`allow create: if request.auth != null`)
  - 업데이트: 불가 (`allow update: if false`)
  - 삭제: 관리자만 가능 (`allow delete: if isAdmin()`)

- **`profiles` 컬렉션** (선택사항):
  - 읽기: 본인 또는 관리자만 가능
  - 쓰기: 본인만 가능
  - 삭제: 관리자만 가능

### Storage 규칙 (`storage.rules`)

- **`seat-usage/{userId}/**` 경로**:
  - 읽기: 모든 사람 가능 (`allow read: if true`)
  - 쓰기: 본인만 가능 (`allow write: if request.auth.uid == userId`)
  - 삭제: 관리자만 가능 (`allow delete: if isAdmin()`)

- **`users/{userId}/**` 경로**:
  - 읽기: 본인 또는 관리자만 가능
  - 쓰기: 본인만 가능
  - 삭제: 관리자만 가능

## ⚠️ 주의사항

1. 관리자 UID는 정확하게 입력해야 합니다. 오타가 있으면 관리자 권한이 작동하지 않습니다.
2. 규칙 변경 후 반드시 **Publish** 버튼을 클릭해야 적용됩니다.
3. 규칙을 잘못 설정하면 앱이 작동하지 않을 수 있으므로, 변경 전에 백업을 권장합니다.
4. 프로덕션 환경에서는 규칙을 더 엄격하게 설정하는 것을 권장합니다.

## 🔍 문제 해결

### "permission-denied" 에러가 발생하는 경우

1. Firebase 콘솔에서 규칙이 올바르게 게시되었는지 확인
2. 관리자 UID가 정확한지 확인
3. 사용자가 로그인되어 있는지 확인
4. 브라우저 개발자 도구 콘솔에서 에러 메시지 확인

### 관리자 권한이 작동하지 않는 경우

1. 관리자 UID가 정확한지 확인 (Authentication > Users에서 확인)
2. 관리자 계정으로 로그인되어 있는지 확인
3. 규칙 파일의 `isAdmin()` 함수에서 UID가 올바르게 설정되었는지 확인
