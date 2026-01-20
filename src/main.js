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

    modalSeatLabel.textContent = String(seat.number)
    modalBackdrop.classList.remove('hidden')

    // 좌석 요약 정보 갱신
    seatInfoMain.textContent = `${seat.number}번 좌석을 선택했습니다.`
    if (seat.status === 'occupied' && seat.studentId && seat.studentName) {
      seatInfoSub.textContent = `현재 사용 중: ${seat.studentId} ${seat.studentName}`
    } else {
      seatInfoSub.textContent = '사용을 누르면 학번·이름을 입력하고 좌석을 사용할 수 있습니다.'
    }
  }

  function closeSeatModal() {
    modalBackdrop.classList.add('hidden')
    selectedSeatNumber = null
  }

  async function recordSeatUsageStart(seat) {
    if (!currentUser || !currentProfile) {
      console.warn('로그인/프로필 정보가 없어 Firestore에 저장하지 못했습니다.')
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
      seatId: seat.id,
      seatNumber: seat.number,
      userName: currentProfile.studentName,
      studentId: currentProfile.studentId,
      email: currentUser.email,
      clickedAt: clickedAtIso, // 좌석 사용하기 버튼을 누른 시간 (ISO)
      date: dateStr, // 활동 날짜 (YYYY-MM-DD)
      time: timeStr, // 활동 시간 (HH:mm)
      createdAt: serverTimestamp(), // Firestore 서버 기준 시간
      released: false,
    }

    await addDoc(collection(db, 'seatUsages'), payload)
  }

  async function recordSeatRelease(seat) {
    if (!currentUser || !currentProfile) return

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
      seatId: seat.id,
      seatNumber: seat.number,
      userName: currentProfile.studentName,
      studentId: currentProfile.studentId,
      email: currentUser.email,
      clickedAt: clickedAtIso,
      date: dateStr,
      time: timeStr,
      createdAt: serverTimestamp(),
      released: true,
    }

    await addDoc(collection(db, 'seatUsages'), payload)
  }

  btnSeatCancel.addEventListener('click', () => {
    // 좌석 선택 화면으로 그냥 돌아가기 (상태 변경 없음)
    closeSeatModal()
    seatInfoMain.textContent = '좌석을 선택하면 정보가 표시됩니다.'
    seatInfoSub.textContent = '사용을 누른 시각은 이후 Firebase로 전송할 예정입니다.'
  })

  btnSeatUse.addEventListener('click', () => {
    if (selectedSeatNumber === null) return

    const seat = getSeatByNumber(selectedSeatNumber)
    if (!seat) return

    if (!currentUser || !currentProfile) {
      alert('로그인 또는 학번/이름 정보가 없습니다. 메인 화면으로 돌아가 다시 로그인해 주세요.')
      window.location.href = '/index.html'
      return
    }

    // 이미 오늘 선택한 좌석이 있고, 다른 좌석을 선택한 경우: 기존 좌석 비우기 (좌석 변경)
    if (restoredSeatNumber && restoredSeatNumber !== seat.number) {
      const prevSeat = getSeatByNumber(restoredSeatNumber)
      if (prevSeat) {
        prevSeat.status = 'available'
        prevSeat.studentId = null
        prevSeat.studentName = null
        prevSeat.startedAt = null

        // 이전 좌석 해제 기록을 Firestore에 남김
        recordSeatRelease(prevSeat).catch((err) => {
          console.error('이전 좌석 해제 기록 저장 중 오류가 발생했습니다:', err)
        })
      }
    }

    // 좌석 상태 업데이트(한 번에 한 좌석만)
    seat.status = 'occupied'
    seat.studentId = currentProfile.studentId
    seat.studentName = currentProfile.studentName
    seat.startedAt = new Date().toISOString()
    restoredSeatNumber = seat.number

    // Firestore 저장 시도 (에러가 발생해도 UI는 업데이트됨)
    recordSeatUsageStart(seat)
      .then(() => {
        console.log('좌석 사용 기록이 Firestore에 저장되었습니다.')
      })
      .catch((err) => {
        console.error('Firestore 저장 중 오류가 발생했습니다:', err)
        console.error('에러 상세:', {
          code: err.code,
          message: err.message,
          stack: err.stack,
        })
        // 에러가 발생해도 UI는 이미 업데이트되었으므로, 사용자에게는 조용히 알림만
        // Firestore 규칙 문제일 수 있으므로 개발자 콘솔에서 확인 가능하도록 함
      })
    
    saveTodaySeat(currentUser.uid, seat)
    renderSeats()

    seatInfoMain.textContent = `${seat.number}번 좌석을 사용 중입니다.`
    seatInfoSub.textContent = `사용자: ${seat.studentId} ${seat.studentName} ｜ 시작 시각: ${formatStartedAtKorean(
      seat.startedAt
    )}`

    closeSeatModal()
  })

  // 사용 종료 버튼: 현재 사용 중인 좌석을 비우고 Firestore에 해제 기록 저장
  btnSeatRelease.addEventListener('click', () => {
    if (!restoredSeatNumber) return
    const seat = getSeatByNumber(restoredSeatNumber)
    if (!seat) return

    const confirmEnd = window.confirm(
      `${seat.number}번 좌석 사용을 종료하시겠습니까?\n(종료 후에는 다른 좌석을 다시 신청해야 합니다.)`
    )
    if (!confirmEnd) return

    // 좌석 상태 비우기
    seat.status = 'available'
    seat.studentId = null
    seat.studentName = null
    seat.startedAt = null

    recordSeatRelease(seat).catch((err) => {
      console.error('좌석 사용 종료 기록 저장 중 오류가 발생했습니다:', err)
      alert('좌석 사용 종료 기록 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    })

    // 오늘자 로컬 저장 삭제
    if (currentUser) {
      localStorage.removeItem(getTodaySeatKey(currentUser.uid))
    }

    restoredSeatNumber = null
    renderSeats()
    seatInfoMain.textContent = '좌석을 선택하면 정보가 표시됩니다.'
    seatInfoSub.textContent = '사용을 누른 시각은 이후 Firebase로 전송할 예정입니다.'
    updateReleaseButtonState()
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

