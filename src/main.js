import './style.css'
import { auth, db } from './firebaseConfig'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore'

// 학생용 좌석 신청 페이지(student.html)용 스크립트
document.addEventListener('DOMContentLoaded', () => {
  const seatLeftTop = document.getElementById('seat-left-top')
  const seatLeftBottom = document.getElementById('seat-left-bottom')
  const seatRightTop = document.getElementById('seat-right-top')
  const seatRightBottom = document.getElementById('seat-right-bottom')
  const seatBottomRow = document.getElementById('seat-bottom-row')
  const seatInfoMain = document.getElementById('seat-info-main')
  const seatInfoSub = document.getElementById('seat-info-sub')

  const userNameDisplay = document.getElementById('user-name-display')
  const userStudentIdDisplay = document.getElementById('user-student-id-display')
  const userEmailDisplay = document.getElementById('user-email-display')

  const modalBackdrop = document.getElementById('seat-modal-backdrop')
  const modalSeatLabel = document.getElementById('modal-seat-label')
  const btnSeatUse = document.getElementById('btn-seat-use')
  const btnSeatCancel = document.getElementById('btn-seat-cancel')
  const btnSeatRelease = document.getElementById('btn-seat-release')

  if (
    !seatLeftTop ||
    !seatLeftBottom ||
    !seatRightTop ||
    !seatRightBottom ||
    !seatBottomRow ||
    !modalBackdrop ||
    !modalSeatLabel ||
    !btnSeatUse ||
    !btnSeatCancel ||
    !btnSeatRelease ||
    !userNameDisplay ||
    !userStudentIdDisplay ||
    !userEmailDisplay
  ) {
    console.warn('좌석 UI 초기화에 필요한 요소를 찾을 수 없습니다.')
    return
  }

  let currentUser = null
  let currentProfile = null
  let restoredSeatNumber = null

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

  function updateUserInfoUI() {
    if (!currentUser || !currentProfile) return

    userNameDisplay.textContent = currentProfile.studentName || '이름 없음'
    userStudentIdDisplay.textContent = currentProfile.studentId || '학번 없음'
    userEmailDisplay.textContent = currentUser.email || '이메일 없음'
  }

  function formatStartedAtKorean(isoString) {
    if (!isoString) return ''
    const d = new Date(isoString)
    if (Number.isNaN(d.getTime())) return isoString

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')

    return `${yyyy}-${mm}-${dd} ${hh}시 ${min}분`
  }

  function updateReleaseButtonState() {
    btnSeatRelease.disabled = !restoredSeatNumber
  }

  // 로그인 상태 확인: 미로그인 또는 프로필 없으면 메인으로 돌려보냄
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

    currentUser = user
    currentProfile = profile
    updateUserInfoUI()

    restoreTodaySeatSelection()
    subscribeToSeatUsage() // Firestore의 오늘자 좌석 사용 현황과 동기화
  })

  const layout = {
    leftTop: [1, 2, 3, 4, 5, 6, 7, 8],
    leftBottom: [9, 10, 11, 12, 13, 14, 15, 16],
    rightTop: [42, 41, 40, 39, 38, 37, 36, 35],
    rightBottom: [34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23],
    bottom: [17, 18, 19, 20, 21, 22],
  }

  const allSeatNumbers = [
    ...layout.leftTop,
    ...layout.leftBottom,
    ...layout.rightTop,
    ...layout.rightBottom,
    ...layout.bottom,
  ]

  const seats = allSeatNumbers.map((num) => ({
    id: num,
    number: num,
    status: 'available', // 'available' | 'occupied'
    studentId: null,
    studentName: null,
    startedAt: null,
  }))

  let selectedSeatNumber = null

  function getTodaySeatKey(uid) {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`
    return `checkbot_current_seat_${uid}_${dateStr}`
  }

  function loadTodaySeat(uid) {
    try {
      const raw = localStorage.getItem(getTodaySeatKey(uid))
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  function saveTodaySeat(uid, seat) {
    const payload = {
      seatNumber: seat.number,
      startedAt: seat.startedAt,
    }
    localStorage.setItem(getTodaySeatKey(uid), JSON.stringify(payload))
  }

  function getSeatByNumber(number) {
    return seats.find((s) => s.number === number) || null
  }

  function createSeatButton(seat) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className =
      'seat ' + (seat.status === 'occupied' ? 'seat--occupied' : 'seat--available')

    const numberSpan = document.createElement('span')
    numberSpan.className = 'seat-number'
    numberSpan.textContent = String(seat.number)
    button.appendChild(numberSpan)

    if (seat.status === 'occupied' && seat.studentId && seat.studentName) {
      const metaSpan = document.createElement('span')
      metaSpan.className = 'seat-meta'
      metaSpan.innerHTML = `${seat.studentId}<br />${seat.studentName}`
      button.appendChild(metaSpan)
    }

    button.addEventListener('click', () => {
      openSeatModal(seat.number)
    })

    return button
  }

  function renderSeatGroup(container, numbers) {
    container.innerHTML = ''
    numbers.forEach((num) => {
      const seat = getSeatByNumber(num)
      if (!seat) return
      container.appendChild(createSeatButton(seat))
    })
  }

  function renderSeats() {
    renderSeatGroup(seatLeftTop, layout.leftTop)
    renderSeatGroup(seatLeftBottom, layout.leftBottom)
    renderSeatGroup(seatRightTop, layout.rightTop)
    renderSeatGroup(seatRightBottom, layout.rightBottom)
    renderSeatGroup(seatBottomRow, layout.bottom)
  }

  function restoreTodaySeatSelection() {
    if (!currentUser || !currentProfile) return
    const saved = loadTodaySeat(currentUser.uid)
    if (!saved || !saved.seatNumber) return

    restoredSeatNumber = saved.seatNumber

    seatInfoMain.textContent = `${saved.seatNumber}번 좌석을 사용 중입니다.`
    seatInfoSub.textContent = `사용자: ${currentProfile.studentId} ${currentProfile.studentName} ｜ 시작 시각: ${formatStartedAtKorean(
      saved.startedAt
    )}`

    updateReleaseButtonState()
  }

  function openSeatModal(seatNumber) {
    selectedSeatNumber = seatNumber
    const seat = getSeatByNumber(seatNumber)
    if (!seat) return

    // 이미 사용 중인 좌석인지 확인
    if (seat.status === 'occupied') {
      // 본인이 사용 중인 좌석인지 확인 (좌석 변경 시나리오)
      const isMySeat = restoredSeatNumber === seat.number
      
      if (!isMySeat) {
        // 다른 사람이 사용 중인 좌석이면 신청 불가
        const occupantInfo = seat.studentId && seat.studentName 
          ? `${seat.studentId} ${seat.studentName}` 
          : '다른 사용자'
        alert(
          `⚠️ ${seat.number}번 좌석은 현재 사용 중입니다.\n\n` +
          `사용자: ${occupantInfo}\n\n` +
          `다른 좌석을 선택해주세요.`
        )
        selectedSeatNumber = null
        return
      }
      // 본인이 사용 중인 좌석이면 모달을 띄우지 않고 정보만 표시
      seatInfoMain.textContent = `${seat.number}번 좌석을 사용 중입니다.`
      seatInfoSub.textContent = `사용자: ${seat.studentId} ${seat.studentName} ｜ 시작 시각: ${formatStartedAtKorean(
        seat.startedAt
      )}`
      return
    }

    // 사용 가능한 좌석이면 모달 띄우기
    modalSeatLabel.textContent = String(seat.number)
    modalBackdrop.classList.remove('hidden')

    // 좌석 요약 정보 갱신
    seatInfoMain.textContent = `${seat.number}번 좌석을 선택했습니다.`
    seatInfoSub.textContent = '사용을 누르면 학번·이름을 입력하고 좌석을 사용할 수 있습니다.'
  }

  function closeSeatModal() {
    modalBackdrop.classList.add('hidden')
    selectedSeatNumber = null
  }

  async function recordSeatUsageStart(seat) {
    try {
      // 필수 데이터 검증
      if (!currentUser || !currentProfile) {
        console.warn('로그인/프로필 정보가 없어 Firestore에 저장하지 못했습니다.')
        return
      }

      if (!seat || !seat.id || !seat.number) {
        console.error('좌석 정보가 올바르지 않습니다:', seat)
        return
      }

      if (!db) {
        console.error('Firestore 데이터베이스가 초기화되지 않았습니다.')
        return
      }

      if (!currentUser.email || !currentProfile.studentId || !currentProfile.studentName) {
        console.error('필수 사용자 정보가 누락되었습니다:', {
          email: currentUser.email,
          studentId: currentProfile.studentId,
          studentName: currentProfile.studentName,
        })
        return
      }

      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const hh = String(now.getHours()).padStart(2, '0')
      const min = String(now.getMinutes()).padStart(2, '0')

      const dateStr = `${yyyy}-${mm}-${dd}`
      const timeStr = `${hh}:${min}`
      const clickedAtIso = now.toISOString()

      const payload = {
        seatId: Number(seat.id) || seat.id,
        seatNumber: Number(seat.number) || seat.number,
        userName: String(currentProfile.studentName || '').trim(),
        studentId: String(currentProfile.studentId || '').trim(),
        email: String(currentUser.email || '').trim(),
        clickedAt: clickedAtIso,
        date: dateStr,
        time: timeStr,
        createdAt: serverTimestamp(),
        released: false,
      }

      // 최종 데이터 검증
      if (!payload.seatNumber || !payload.studentId || !payload.userName || !payload.email) {
        console.error('페이로드 데이터 검증 실패:', payload)
        return
      }

      await addDoc(collection(db, 'seatUsages'), payload)
      console.log('좌석 사용 기록이 성공적으로 저장되었습니다:', payload.seatNumber)
    } catch (error) {
      console.error('좌석 사용 기록 저장 중 오류 발생:', {
        error,
        code: error?.code,
        message: error?.message,
        seat: seat?.number,
        user: currentUser?.email,
      })
      throw error // 상위에서 처리할 수 있도록 에러 재발생
    }
  }

  async function recordSeatRelease(seat) {
    try {
      // 필수 데이터 검증
      if (!currentUser || !currentProfile) {
        console.warn('로그인/프로필 정보가 없어 해제 기록을 저장하지 못했습니다.')
        return
      }

      if (!seat || !seat.id || !seat.number) {
        console.error('좌석 정보가 올바르지 않습니다:', seat)
        return
      }

      if (!db) {
        console.error('Firestore 데이터베이스가 초기화되지 않았습니다.')
        return
      }

      if (!currentUser.email || !currentProfile.studentId || !currentProfile.studentName) {
        console.error('필수 사용자 정보가 누락되었습니다.')
        return
      }

      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const hh = String(now.getHours()).padStart(2, '0')
      const min = String(now.getMinutes()).padStart(2, '0')

      const dateStr = `${yyyy}-${mm}-${dd}`
      const timeStr = `${hh}:${min}`
      const clickedAtIso = now.toISOString()

      const payload = {
        seatId: Number(seat.id) || seat.id,
        seatNumber: Number(seat.number) || seat.number,
        userName: String(currentProfile.studentName || '').trim(),
        studentId: String(currentProfile.studentId || '').trim(),
        email: String(currentUser.email || '').trim(),
        clickedAt: clickedAtIso,
        date: dateStr,
        time: timeStr,
        createdAt: serverTimestamp(),
        released: true,
      }

      // 최종 데이터 검증
      if (!payload.seatNumber || !payload.studentId || !payload.userName || !payload.email) {
        console.error('페이로드 데이터 검증 실패:', payload)
        return
      }

      await addDoc(collection(db, 'seatUsages'), payload)
      console.log('좌석 해제 기록이 성공적으로 저장되었습니다:', payload.seatNumber)
    } catch (error) {
      console.error('좌석 해제 기록 저장 중 오류 발생:', {
        error,
        code: error?.code,
        message: error?.message,
        seat: seat?.number,
        user: currentUser?.email,
      })
      throw error
    }
  }

  btnSeatCancel.addEventListener('click', () => {
    // 좌석 선택 화면으로 그냥 돌아가기 (상태 변경 없음)
    closeSeatModal()
    seatInfoMain.textContent = '좌석을 선택하면 정보가 표시됩니다.'
    seatInfoSub.textContent = '사용을 누른 시각은 이후 Firebase로 전송할 예정입니다.'
  })

  btnSeatUse.addEventListener('click', async () => {
    if (selectedSeatNumber === null) return

    const seat = getSeatByNumber(selectedSeatNumber)
    if (!seat) return

    if (!currentUser || !currentProfile) {
      alert('로그인 또는 학번/이름 정보가 없습니다. 메인 화면으로 돌아가 다시 로그인해 주세요.')
      window.location.href = '/index.html'
      return
    }

    // 이미 사용 중인 좌석인지 재확인 (모달이 띄워진 후 상태가 변경될 수 있음)
    if (seat.status === 'occupied' && restoredSeatNumber !== seat.number) {
      const occupantInfo = seat.studentId && seat.studentName 
        ? `${seat.studentId} ${seat.studentName}` 
        : '다른 사용자'
      alert(
        `⚠️ ${seat.number}번 좌석은 현재 사용 중입니다.\n\n` +
        `사용자: ${occupantInfo}\n\n` +
        `다른 좌석을 선택해주세요.`
      )
      closeSeatModal()
      return
    }

    // 버튼 비활성화 (중복 클릭 방지)
    const originalButtonText = btnSeatUse.textContent || btnSeatUse.innerText || '사용'
    btnSeatUse.disabled = true
    if (btnSeatUse.querySelector('span')) {
      btnSeatUse.querySelector('span').textContent = '저장 중...'
    } else {
      btnSeatUse.textContent = '저장 중...'
    }

    try {
      // 이미 오늘 선택한 좌석이 있고, 다른 좌석을 선택한 경우: 기존 좌석 비우기 (좌석 변경)
      if (restoredSeatNumber && restoredSeatNumber !== seat.number) {
        const prevSeat = getSeatByNumber(restoredSeatNumber)
        if (prevSeat) {
          // 이전 좌석 해제 기록을 Firestore에 먼저 저장
          try {
            await recordSeatRelease(prevSeat)
            console.log('이전 좌석 해제 기록이 저장되었습니다.')
          } catch (err) {
            console.error('이전 좌석 해제 기록 저장 중 오류가 발생했습니다:', err)
            // 해제 기록 실패해도 계속 진행
          }

          // 이전 좌석 상태 비우기
          prevSeat.status = 'available'
          prevSeat.studentId = null
          prevSeat.studentName = null
          prevSeat.startedAt = null
        }
      }

      // Firestore에 좌석 사용 기록 저장 (성공 후에만 UI 업데이트)
      await recordSeatUsageStart(seat)
      console.log('✅ 좌석 사용 기록이 Firestore에 저장되었습니다.')

      // 저장 성공 후 UI 업데이트
      seat.status = 'occupied'
      seat.studentId = currentProfile.studentId
      seat.studentName = currentProfile.studentName
      seat.startedAt = new Date().toISOString()
      restoredSeatNumber = seat.number

      saveTodaySeat(currentUser.uid, seat)
      renderSeats()

      seatInfoMain.textContent = `${seat.number}번 좌석을 사용 중입니다.`
      seatInfoSub.textContent = `사용자: ${seat.studentId} ${seat.studentName} ｜ 시작 시각: ${formatStartedAtKorean(
        seat.startedAt
      )}`

      closeSeatModal()
    } catch (err) {
      console.error('❌ 좌석 사용 기록 저장 실패:', err)
      console.error('에러 상세:', {
        code: err?.code,
        message: err?.message,
        stack: err?.stack,
      })

      // Firestore 규칙 문제인지 확인
      if (err?.code === 'permission-denied') {
        alert(
          '⚠️ Firestore 규칙 문제: 좌석 사용 기록을 저장할 권한이 없습니다.\n\n' +
          'Firebase 콘솔에서 Firestore 규칙을 확인해주세요:\n' +
          'match /seatUsages/{document} {\n' +
          '  allow read, write: if request.auth != null;\n' +
          '}'
        )
      } else if (err?.code === 'unavailable') {
        alert('⚠️ 네트워크 문제: Firestore에 연결할 수 없습니다.\n잠시 후 다시 시도해주세요.')
      } else {
        alert(
          '⚠️ 좌석 사용 기록 저장 중 오류가 발생했습니다.\n\n' +
          '에러 코드: ' +
          (err?.code || '알 수 없음') +
          '\n에러 메시지: ' +
          (err?.message || '알 수 없음') +
          '\n\n개발자 콘솔에서 자세한 정보를 확인할 수 있습니다.'
        )
      }

      // UI 롤백 (저장 실패 시 원래 상태로)
      if (restoredSeatNumber && restoredSeatNumber !== seat.number) {
        const prevSeat = getSeatByNumber(restoredSeatNumber)
        if (prevSeat) {
          // 이전 좌석 상태 복원
          prevSeat.status = 'occupied'
          prevSeat.studentId = currentProfile.studentId
          prevSeat.studentName = currentProfile.studentName
          prevSeat.startedAt = loadTodaySeat(currentUser.uid)?.startedAt || new Date().toISOString()
        }
      }
      renderSeats()
    } finally {
      // 버튼 다시 활성화
      btnSeatUse.disabled = false
      if (btnSeatUse.querySelector('span')) {
        btnSeatUse.querySelector('span').textContent = '사용'
      } else {
        btnSeatUse.textContent = originalButtonText
      }
    }
  })

  // 사용 종료 버튼: 현재 사용 중인 좌석을 비우고 Firestore에 해제 기록 저장
  btnSeatRelease.addEventListener('click', async () => {
    if (!restoredSeatNumber) return
    const seat = getSeatByNumber(restoredSeatNumber)
    if (!seat) return

    const confirmEnd = window.confirm(
      `${seat.number}번 좌석 사용을 종료하시겠습니까?\n(종료 후에는 다른 좌석을 다시 신청해야 합니다.)`
    )
    if (!confirmEnd) return

    // 버튼 비활성화 (중복 클릭 방지)
    const originalReleaseButtonText = btnSeatRelease.textContent || btnSeatRelease.innerText || '사용 종료'
    btnSeatRelease.disabled = true
    if (btnSeatRelease.querySelector('span')) {
      btnSeatRelease.querySelector('span').textContent = '종료 중...'
    } else {
      btnSeatRelease.textContent = '종료 중...'
    }

    try {
      // Firestore에 해제 기록 저장 (성공 후에만 UI 업데이트)
      await recordSeatRelease(seat)
      console.log('✅ 좌석 해제 기록이 Firestore에 저장되었습니다.')

      // 저장 성공 후 UI 업데이트
      seat.status = 'available'
      seat.studentId = null
      seat.studentName = null
      seat.startedAt = null

      // 오늘자 로컬 저장 삭제
      if (currentUser) {
        localStorage.removeItem(getTodaySeatKey(currentUser.uid))
      }

      restoredSeatNumber = null
      renderSeats()
      seatInfoMain.textContent = '좌석을 선택하면 정보가 표시됩니다.'
      seatInfoSub.textContent = '사용을 누른 시각은 이후 Firebase로 전송할 예정입니다.'
      updateReleaseButtonState()
    } catch (err) {
      console.error('❌ 좌석 해제 기록 저장 실패:', err)
      console.error('에러 상세:', {
        code: err?.code,
        message: err?.message,
        stack: err?.stack,
      })

      // Firestore 규칙 문제인지 확인
      if (err?.code === 'permission-denied') {
        alert(
          '⚠️ Firestore 규칙 문제: 좌석 해제 기록을 저장할 권한이 없습니다.\n\n' +
          'Firebase 콘솔에서 Firestore 규칙을 확인해주세요.'
        )
      } else if (err?.code === 'unavailable') {
        alert('⚠️ 네트워크 문제: Firestore에 연결할 수 없습니다.\n잠시 후 다시 시도해주세요.')
      } else {
        alert(
          '⚠️ 좌석 사용 종료 기록 저장 중 오류가 발생했습니다.\n\n' +
          '에러 코드: ' +
          (err?.code || '알 수 없음') +
          '\n에러 메시지: ' +
          (err?.message || '알 수 없음') +
          '\n\n개발자 콘솔에서 자세한 정보를 확인할 수 있습니다.'
        )
      }

      // UI 롤백 (저장 실패 시 원래 상태로)
      seat.status = 'occupied'
      seat.studentId = currentProfile.studentId
      seat.studentName = currentProfile.studentName
      seat.startedAt = loadTodaySeat(currentUser.uid)?.startedAt || new Date().toISOString()
      renderSeats()
    } finally {
      // 버튼 다시 활성화
      btnSeatRelease.disabled = false
      if (btnSeatRelease.querySelector('span')) {
        btnSeatRelease.querySelector('span').textContent = '사용 종료'
      } else {
        btnSeatRelease.textContent = originalReleaseButtonText
      }
    }
  })

  // 초기 렌더링
  renderSeats()
  updateReleaseButtonState()

  // Firestore에서 오늘자 좌석 사용 현황을 구독하여 좌석표를 동기화
  function getTodayDateStr() {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  function subscribeToSeatUsage() {
    const today = getTodayDateStr()
    const q = query(collection(db, 'seatUsages'), where('date', '==', today))

    onSnapshot(
      q,
      (snapshot) => {
        const now = new Date()
        const latestBySeat = new Map()

        snapshot.forEach((doc) => {
          const data = doc.data()
          const seatNumber = data.seatNumber
          if (!seatNumber) return

          const prev = latestBySeat.get(seatNumber)
          if (!prev || (data.clickedAt && data.clickedAt > prev.clickedAt)) {
            latestBySeat.set(seatNumber, data)
          }
        })

        const isAfterCutoff = now.getHours() >= 21

        if (isAfterCutoff) {
          // 21시 이후에는 모든 좌석을 사용 종료 상태로 간주
          seats.forEach((seat) => {
            seat.status = 'available'
            seat.studentId = null
            seat.studentName = null
            seat.startedAt = null
          })

          renderSeats()

          // 오늘자 로컬 좌석 정보도 초기화
          if (currentUser) {
            localStorage.removeItem(getTodaySeatKey(currentUser.uid))
          }
          restoredSeatNumber = null
          seatInfoMain.textContent = '좌석을 선택하면 정보가 표시됩니다.'
          seatInfoSub.textContent = '사용을 누른 시각은 이후 Firebase로 전송할 예정입니다.'
          updateReleaseButtonState()
        } else {
          // Firestore 기준으로 좌석 상태 동기화
          seats.forEach((seat) => {
            const usage = latestBySeat.get(seat.number)
            if (usage && !usage.released) {
              seat.status = 'occupied'
              seat.studentId = usage.studentId || null
              seat.studentName = usage.userName || null
              seat.startedAt = usage.clickedAt || null
            } else {
              seat.status = 'available'
              seat.studentId = null
              seat.studentName = null
              seat.startedAt = null
            }
          })

          renderSeats()

          // 현재 로그인한 사용자의 좌석 정보 텍스트도 Firestore 기준으로 갱신
          if (currentUser && restoredSeatNumber) {
            const mySeatUsage = latestBySeat.get(restoredSeatNumber)
            if (mySeatUsage && !mySeatUsage.released) {
              seatInfoMain.textContent = `${restoredSeatNumber}번 좌석을 사용 중입니다.`
              seatInfoSub.textContent = `사용자: ${mySeatUsage.studentId} ${mySeatUsage.userName} ｜ 시작 시각: ${formatStartedAtKorean(
                mySeatUsage.clickedAt
              )}`
            } else {
              // Firestore 상에서 더 이상 사용 중이 아니면 상태 초기화
              restoredSeatNumber = null
              seatInfoMain.textContent = '좌석을 선택하면 정보가 표시됩니다.'
              seatInfoSub.textContent = '사용을 누른 시각은 이후 Firebase로 전송할 예정입니다.'
            }
            updateReleaseButtonState()
          }
        }
      },
      (error) => {
        console.error('학생용 좌석 사용 현황 구독 중 오류가 발생했습니다:', error)
      }
    )
  }
})

