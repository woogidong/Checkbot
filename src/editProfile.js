import './style.css'
import { auth } from './firebaseConfig'
import { onAuthStateChanged } from 'firebase/auth'

document.addEventListener('DOMContentLoaded', () => {
  const userNameDisplay = document.getElementById('user-name-display')
  const userStudentIdDisplay = document.getElementById('user-student-id-display')
  const userEmailDisplay = document.getElementById('user-email-display')

  const form = document.getElementById('profile-edit-form')
  const studentIdInput = document.getElementById('edit-student-id')
  const studentNameInput = document.getElementById('edit-student-name')
  const btnCancel = document.getElementById('btn-profile-cancel')

  if (
    !userNameDisplay ||
    !userStudentIdDisplay ||
    !userEmailDisplay ||
    !form ||
    !studentIdInput ||
    !studentNameInput ||
    !btnCancel
  ) {
    console.warn('개인정보 수정 페이지의 일부 요소를 찾지 못했습니다.')
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
    try {
      localStorage.setItem(getProfileKey(uid), JSON.stringify(profile))
    } catch (e) {
      console.error('프로필 저장 중 오류가 발생했습니다:', e)
      alert('프로필을 저장하는 중 오류가 발생했습니다. 저장 공간을 확인해 주세요.')
    }
  }

  function updateHeaderUI(user, profile) {
    userNameDisplay.textContent = profile?.studentName || '이름 없음'
    userStudentIdDisplay.textContent = profile?.studentId || '학번 없음'
    userEmailDisplay.textContent = user?.email || '이메일 없음'
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      alert('로그인 정보가 없습니다. 메인 화면으로 이동합니다.')
      window.location.href = '/index.html'
      return
    }

    const profile = loadProfile(user.uid)
    if (!profile || !profile.studentId || !profile.studentName) {
      alert('학번/이름 정보가 없습니다. 메인 화면에서 다시 로그인해 주세요.')
      window.location.href = '/index.html'
      return
    }

    // 헤더 표시
    updateHeaderUI(user, profile)

    // 폼 초기값
    studentIdInput.value = profile.studentId || ''
    studentNameInput.value = profile.studentName || ''

    form.addEventListener('submit', (e) => {
      e.preventDefault()

      const newId = studentIdInput.value.trim()
      const newName = studentNameInput.value.trim()

      if (!/^\d{5}$/.test(newId)) {
        alert('학번은 5자리 숫자로만 입력해 주세요.')
        studentIdInput.focus()
        return
      }

      if (!newName) {
        alert('이름을 입력해 주세요.')
        studentNameInput.focus()
        return
      }

      const updatedProfile = {
        ...profile,
        studentId: newId,
        studentName: newName,
      }

      saveProfile(user.uid, updatedProfile)
      updateHeaderUI(user, updatedProfile)

      alert('개인정보가 성공적으로 수정되었습니다.')
    })

    btnCancel.addEventListener('click', () => {
      window.history.length > 1 ? window.history.back() : (window.location.href = '/myInfo.html')
    })
  })
})

