import './style.css'
import { auth, provider } from './firebaseConfig'
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth'

// 메인 페이지(index.html)용 스크립트
// Google 로그인 및 로그인 상태에 따른 버튼 제어를 담당합니다.

document.addEventListener('DOMContentLoaded', () => {
  const btnLogin = document.getElementById('btn-google-login')
  const btnLogout = document.getElementById('btn-google-logout')
  const loginButtonLabel = document.getElementById('login-button-label')
  const btnTeacherNav = document.getElementById('btn-teacher-nav')
  const navButtonGroup = document.getElementById('nav-button-group')
  const navHint = document.getElementById('nav-hint')
  const navSection = document.getElementById('nav-section')

  const profileModalBackdrop = document.getElementById('profile-modal-backdrop')
  const profileStudentIdInput = document.getElementById('profile-student-id')
  const profileStudentNameInput = document.getElementById('profile-student-name')
  const btnProfileSave = document.getElementById('btn-profile-save')
  const btnProfileCancel = document.getElementById('btn-profile-cancel')

  if (
    !btnLogin ||
    !btnLogout ||
    !btnTeacherNav ||
    !navButtonGroup ||
    !navHint ||
    !loginButtonLabel ||
    !navSection ||
    !profileModalBackdrop ||
    !profileStudentIdInput ||
    !profileStudentNameInput ||
    !btnProfileSave ||
    !btnProfileCancel
  ) {
    console.warn('index 페이지의 일부 요소를 찾지 못했습니다.')
    return
  }

  function getProfileKey(uid) {
    return `checkbot_profile_${uid}`
  }

  function loadProfile(uid) {
    try {
      const raw = localStorage.getItem(getProfileKey(uid))
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  function saveProfile(uid, profile) {
    localStorage.setItem(getProfileKey(uid), JSON.stringify(profile))
  }

  function openProfileModal() {
    profileModalBackdrop.classList.remove('hidden')
    profileStudentIdInput.value = ''
    profileStudentNameInput.value = ''
    profileStudentIdInput.focus()
  }

  function closeProfileModal() {
    profileModalBackdrop.classList.add('hidden')
  }

  function setLoggedInUI(user, profile) {
    // 교사용 좌석 현황 버튼은 로그인 중에는 숨김
    btnTeacherNav.classList.add('hidden')

    // 네비게이션 영역 및 버튼 표시
    navSection.classList.remove('hidden')
    navButtonGroup.classList.remove('hidden')

    const name = profile?.studentName || user.displayName || '로그인한 사용자'
    const studentId = profile?.studentId
    navHint.textContent = studentId
      ? `${name} (${studentId})님, 반갑습니다.`
      : `${name}님, 반갑습니다다.`

    // 네비게이션 버튼 표시
    // 로그인 버튼 상태 변경 (사용자 이름 표시)
    loginButtonLabel.textContent = `${studentId} ${name}`
    btnLogin.classList.add('btn-outline')
    btnLogin.classList.remove('btn-primary')
    btnLogin.disabled = true

    // 로그아웃 버튼 표시
    btnLogout.classList.remove('hidden')
  }

  function setLoggedOutUI() {
    // 비로그인 상태에서는 교사용 좌석 현황 버튼 노출
    btnTeacherNav.classList.remove('hidden')
    // 네비게이션 영역 및 버튼 숨김
    navSection.classList.add('hidden')
    navButtonGroup.classList.add('hidden')
    navHint.textContent = 'Google 로그인 후 학생 좌석 신청 기능을 사용할 수 있습니다.'

    // 로그인 버튼 상태 초기화
    loginButtonLabel.textContent = 'Google 계정으로 로그인'
    btnLogin.classList.add('btn-primary')
    btnLogin.classList.remove('btn-outline')
    btnLogin.disabled = false

    // 로그아웃 버튼 숨김
    btnLogout.classList.add('hidden')
  }

  // 로그인 상태 변화 감지
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const existingProfile = loadProfile(user.uid)
      if (existingProfile && existingProfile.studentId && existingProfile.studentName) {
        setLoggedInUI(user, existingProfile)
      } else {
        // 최초 로그인 또는 프로필 미완성: 기본 UI는 로그인 완료 상태로 두되,
        // 좌석/모니터링 버튼은 감추고 프로필 입력 모달을 띄웁니다.
        const displayName = user.displayName || '로그인한 사용자'
        loginButtonLabel.textContent = `${displayName}님 로그인됨`
        btnLogin.classList.add('btn-outline')
        btnLogin.classList.remove('btn-primary')
        btnLogin.disabled = true
        btnLogout.classList.remove('hidden')

        navSection.classList.add('hidden')
        navButtonGroup.classList.add('hidden')
        navHint.textContent = '학번과 이름을 먼저 등록해 주세요.'

        openProfileModal()
      }
    } else {
      setLoggedOutUI()
    }
  })

  // Google 로그인 버튼 클릭
  btnLogin.addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, provider)
      // onAuthStateChanged에서 UI가 자동으로 갱신됩니다.
    } catch (error) {
      console.error('Google 로그인 중 오류가 발생했습니다:', error)
      alert('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    }
  })

  // 로그아웃 버튼 클릭
  btnLogout.addEventListener('click', async () => {
    try {
      await signOut(auth)
      // onAuthStateChanged에서 UI가 자동으로 갱신됩니다.
    } catch (error) {
      console.error('로그아웃 중 오류가 발생했습니다:', error)
      alert('로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    }
  })

  // 프로필 저장 버튼
  btnProfileSave.addEventListener('click', async () => {
    const user = auth.currentUser
    if (!user) {
      alert('로그인 정보가 없어 다시 로그인해 주세요.')
      closeProfileModal()
      setLoggedOutUI()
      return
    }

    const studentId = profileStudentIdInput.value.trim()
    const studentName = profileStudentNameInput.value.trim()

    if (!/^\d{5}$/.test(studentId)) {
      alert('학번은 숫자 5자리로 입력해 주세요. 예: 10523')
      profileStudentIdInput.focus()
      return
    }

    if (!studentName) {
      alert('이름을 입력해 주세요.')
      profileStudentNameInput.focus()
      return
    }

    const profile = { studentId, studentName }
    saveProfile(user.uid, profile)
    closeProfileModal()
    setLoggedInUI(user, profile)
  })

  // 프로필 입력 취소: 이번 로그인 세션을 종료 (다음에 다시 입력하도록)
  btnProfileCancel.addEventListener('click', async () => {
    try {
      closeProfileModal()
      await signOut(auth)
    } catch (error) {
      console.error('프로필 취소 및 로그아웃 중 오류가 발생했습니다:', error)
      alert('작업 중 오류가 발생했습니다. 다시 시도해 주세요.')
    }
  })
})