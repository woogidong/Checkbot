import './style.css'
import { auth, db } from './firebaseConfig'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore'

// 개인정보 및 이용 기록 페이지(myInfo.html)용 스크립트
document.addEventListener('DOMContentLoaded', () => {
  const userNameDisplay = document.getElementById('user-name-display')
  const userStudentIdDisplay = document.getElementById('user-student-id-display')
  const userEmailDisplay = document.getElementById('user-email-display')
  const monthlyStatsContainer = document.getElementById('monthly-stats')
  const calendarContainer = document.getElementById('calendar-container')
  const currentMonthDisplay = document.getElementById('current-month-display')
  const btnPrevMonth = document.getElementById('btn-prev-month')
  const btnNextMonth = document.getElementById('btn-next-month')
  const usageListContainer = document.getElementById('usage-list-container')

  if (
    !userNameDisplay ||
    !userStudentIdDisplay ||
    !userEmailDisplay ||
    !monthlyStatsContainer ||
    !calendarContainer ||
    !currentMonthDisplay ||
    !btnPrevMonth ||
    !btnNextMonth ||
    !usageListContainer
  ) {
    console.warn('개인정보 페이지의 일부 요소를 찾을 수 없습니다.')
    return
  }

  let currentUser = null
  let currentProfile = null
  let currentDate = new Date()
  let allUsageRecords = []

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

  // 날짜 포맷팅 함수
  function formatDate(date) {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  // 시간 차이 계산 (분 단위)
  function calculateTimeDifference(startTime, endTime) {
    const start = new Date(startTime)
    const end = new Date(endTime)
    return Math.max(0, Math.floor((end - start) / (1000 * 60))) // 분 단위
  }

  // 분을 시간:분 형식으로 변환
  function formatMinutes(minutes) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}분`
    if (mins === 0) return `${hours}시간`
    return `${hours}시간 ${mins}분`
  }

  // Firestore에서 사용자의 좌석 사용 기록 조회
  async function loadUsageRecords() {
    if (!currentUser || !currentUser.email) {
      console.warn('사용자 정보가 없어 기록을 불러올 수 없습니다.')
      return
    }

    try {
      // orderBy 없이 먼저 쿼리 (인덱스 문제 방지)
      const q = query(
        collection(db, 'seatUsages'),
        where('email', '==', currentUser.email)
      )

      const querySnapshot = await getDocs(q)
      allUsageRecords = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        // clickedAt 필드가 있는 문서만 추가
        if (data.clickedAt) {
          allUsageRecords.push({
            id: doc.id,
            ...data,
          })
        }
      })

      // 클라이언트 측에서 정렬 (최신순)
      allUsageRecords.sort((a, b) => {
        const timeA = a.clickedAt ? new Date(a.clickedAt).getTime() : 0
        const timeB = b.clickedAt ? new Date(b.clickedAt).getTime() : 0
        return timeB - timeA // 내림차순 (최신순)
      })

      console.log(`✅ ${allUsageRecords.length}개의 이용 기록을 불러왔습니다.`)
      renderCalendar()
      renderMonthlyStats()
      renderUsageList()
    } catch (error) {
      console.error('이용 기록 조회 중 오류 발생:', error)
      console.error('에러 상세:', {
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
      })
      
      let errorMessage = '이용 기록을 불러오는 중 오류가 발생했습니다.\n\n'
      
      if (error?.code === 'permission-denied') {
        errorMessage += '⚠️ Firestore 규칙 문제: 이용 기록을 읽을 권한이 없습니다.\n\n'
        errorMessage += 'Firebase 콘솔에서 Firestore 규칙을 확인해주세요.\n'
        errorMessage += '개인정보 페이지에서 자신의 기록을 읽을 수 있도록 규칙이 설정되어 있어야 합니다.'
      } else if (error?.code === 'failed-precondition') {
        errorMessage += '⚠️ 인덱스 문제: Firestore 인덱스가 필요합니다.\n\n'
        errorMessage += 'Firebase 콘솔에서 제안된 인덱스를 생성해주세요.'
      } else if (error?.code === 'unavailable') {
        errorMessage += '⚠️ 네트워크 문제: Firestore에 연결할 수 없습니다.\n\n'
        errorMessage += '인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.'
      } else {
        errorMessage += `에러 코드: ${error?.code || '알 수 없음'}\n`
        errorMessage += `에러 메시지: ${error?.message || '알 수 없음'}`
      }
      
      alert(errorMessage)
    }
  }

  // 날짜별 이용 시간 계산
  function calculateDailyUsage() {
    const dailyUsage = new Map() // date -> { totalMinutes, sessions: [{ start, end, seatNumber }] }

    // 날짜별로 그룹화
    const recordsByDate = new Map()
    allUsageRecords.forEach((record) => {
      if (!record.date) return
      if (!recordsByDate.has(record.date)) {
        recordsByDate.set(record.date, [])
      }
      recordsByDate.get(record.date).push(record)
    })

    // 각 날짜별로 이용 시간 계산
    recordsByDate.forEach((records, date) => {
      const sortedRecords = records.sort((a, b) => {
        const timeA = a.clickedAt ? new Date(a.clickedAt).getTime() : 0
        const timeB = b.clickedAt ? new Date(b.clickedAt).getTime() : 0
        return timeA - timeB
      })

      let totalMinutes = 0
      const sessions = []
      const activeSessions = new Map() // seatNumber -> session

      sortedRecords.forEach((record) => {
        if (!record.released) {
          // 사용 시작
          if (!activeSessions.has(record.seatNumber)) {
            activeSessions.set(record.seatNumber, {
              start: record.clickedAt,
              seatNumber: record.seatNumber,
              startRecord: record,
            })
          }
        } else {
          // 사용 종료
          const session = activeSessions.get(record.seatNumber)
          if (session) {
            const minutes = calculateTimeDifference(
              session.start,
              record.clickedAt
            )
            totalMinutes += minutes
            sessions.push({
              ...session,
              end: record.clickedAt,
              minutes,
              endRecord: record,
            })
            activeSessions.delete(record.seatNumber)
          }
        }
      })

      // 아직 종료되지 않은 세션 처리 (현재 시간까지)
      activeSessions.forEach((session) => {
        const now = new Date()
        const minutes = calculateTimeDifference(session.start, now.toISOString())
        totalMinutes += minutes
        sessions.push({
          ...session,
          end: now.toISOString(),
          minutes,
          isOngoing: true,
        })
      })

      dailyUsage.set(date, {
        totalMinutes,
        sessions,
      })
    })

    return dailyUsage
  }

  // 월별 통계 렌더링
  function renderMonthlyStats() {
    const dailyUsage = calculateDailyUsage()
    const monthlyStats = new Map() // YYYY-MM -> totalMinutes

    dailyUsage.forEach((usage, date) => {
      const monthKey = date.substring(0, 7) // YYYY-MM
      const current = monthlyStats.get(monthKey) || 0
      monthlyStats.set(monthKey, current + usage.totalMinutes)
    })

    if (monthlyStats.size === 0) {
      monthlyStatsContainer.innerHTML = '<p class="muted">이용 기록이 없습니다.</p>'
      return
    }

    const sortedMonths = Array.from(monthlyStats.entries()).sort((a, b) => b[0].localeCompare(a[0]))

    monthlyStatsContainer.innerHTML = sortedMonths
      .map(([month, minutes]) => {
        const [year, monthNum] = month.split('-')
        const monthNames = [
          '1월',
          '2월',
          '3월',
          '4월',
          '5월',
          '6월',
          '7월',
          '8월',
          '9월',
          '10월',
          '11월',
          '12월',
        ]
        return `
          <div style="padding: 16px; border-radius: 12px; background: #f9fafb; border: 1px solid #e5e7eb;">
            <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">${year}년 ${monthNames[parseInt(monthNum) - 1]}</div>
            <div style="font-size: 1.5rem; font-weight: 600; color: #111827;">${formatMinutes(minutes)}</div>
          </div>
        `
      })
      .join('')
  }

  // 달력 렌더링
  function renderCalendar() {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const dailyUsage = calculateDailyUsage()

    // 달력 헤더
    const monthNames = [
      '1월',
      '2월',
      '3월',
      '4월',
      '5월',
      '6월',
      '7월',
      '8월',
      '9월',
      '10월',
      '11월',
      '12월',
    ]
    currentMonthDisplay.textContent = `${year}년 ${monthNames[month]}`

    // 첫 번째 날과 마지막 날
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - startDate.getDay()) // 일요일로 맞춤

    // 달력 그리드 생성
    let html = '<div class="calendar-grid">'
    
    // 요일 헤더
    const weekDays = ['일', '월', '화', '수', '목', '금', '토']
    html += '<div class="calendar-weekday-row">'
    weekDays.forEach((day) => {
      html += `<div class="calendar-weekday">${day}</div>`
    })
    html += '</div>'

    // 날짜 셀
    const current = new Date(startDate)
    for (let week = 0; week < 6; week++) {
      html += '<div class="calendar-week-row">'
      for (let day = 0; day < 7; day++) {
        const dateStr = formatDate(current)
        const isCurrentMonth = current.getMonth() === month
        const usage = dailyUsage.get(dateStr)
        const isToday = dateStr === formatDate(new Date())

        let cellClass = 'calendar-day'
        if (!isCurrentMonth) cellClass += ' calendar-day--other-month'
        if (isToday) cellClass += ' calendar-day--today'

        html += `<div class="${cellClass}">`
        html += `<div class="calendar-day-number">${current.getDate()}</div>`
        
        if (usage && usage.totalMinutes > 0) {
          html += `<div class="calendar-day-usage">${formatMinutes(usage.totalMinutes)}</div>`
        }
        
        html += '</div>'
        current.setDate(current.getDate() + 1)
      }
      html += '</div>'
    }

    html += '</div>'
    calendarContainer.innerHTML = html
  }

  // 상세 이용 기록 목록 렌더링
  function renderUsageList() {
    const dailyUsage = calculateDailyUsage()
    const sortedDates = Array.from(dailyUsage.keys()).sort((a, b) => b.localeCompare(a))

    if (sortedDates.length === 0) {
      usageListContainer.innerHTML = '<p class="muted">이용 기록이 없습니다.</p>'
      return
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">'
    
    sortedDates.forEach((date) => {
      const usage = dailyUsage.get(date)
      const [year, month, day] = date.split('-')
      const monthNames = [
        '1월',
        '2월',
        '3월',
        '4월',
        '5월',
        '6월',
        '7월',
        '8월',
        '9월',
        '10월',
        '11월',
        '12월',
      ]

      html += `
        <div style="padding: 16px; border-radius: 12px; background: #f9fafb; border: 1px solid #e5e7eb;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 600; font-size: 1.1rem; margin-bottom: 4px;">
                ${year}년 ${monthNames[parseInt(month) - 1]} ${parseInt(day)}일
              </div>
              <div style="font-size: 0.9rem; color: #6b7280;">
                총 이용 시간: <strong>${formatMinutes(usage.totalMinutes)}</strong>
              </div>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
      `

      usage.sessions.forEach((session, idx) => {
        const startTime = new Date(session.start)
        const endTime = session.isOngoing ? new Date() : new Date(session.end)
        const startStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`
        const endStr = session.isOngoing 
          ? '진행 중' 
          : `${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`

        html += `
          <div style="padding: 10px; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 500;">${session.seatNumber}번 좌석</div>
                <div style="font-size: 0.85rem; color: #6b7280; margin-top: 2px;">
                  ${startStr} ~ ${endStr}
                </div>
              </div>
              <div style="font-weight: 600; color: #3b82f6;">
                ${formatMinutes(session.minutes)}
              </div>
            </div>
          </div>
        `
      })

      html += `
          </div>
        </div>
      `
    })

    html += '</div>'
    usageListContainer.innerHTML = html
  }

  // 이전 달로 이동
  btnPrevMonth.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1)
    renderCalendar()
  })

  // 다음 달로 이동
  btnNextMonth.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1)
    renderCalendar()
  })

  // 사용자 인증 상태 확인
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      alert('로그인이 필요합니다. 메인 페이지로 이동합니다.')
      window.location.href = '/index.html'
      return
    }

    currentUser = user
    currentProfile = loadProfile(user.uid)

    if (!currentProfile) {
      alert('학번/이름 정보가 없습니다. 메인 페이지로 이동합니다.')
      window.location.href = '/index.html'
      return
    }

    // 사용자 정보 표시
    userNameDisplay.textContent = currentProfile.studentName || '이름 없음'
    userStudentIdDisplay.textContent = currentProfile.studentId || '학번 없음'
    userEmailDisplay.textContent = user.email || '이메일 없음'

    // 이용 기록 로드
    await loadUsageRecords()
  })
})
