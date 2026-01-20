import './style.css'
import { db } from './firebaseConfig'
import { collection, query, where, onSnapshot } from 'firebase/firestore'

// 교사용 좌석 모니터링 페이지(teacherMonitor.html)용 스크립트
// 오늘 날짜 기준으로 Firestore의 좌석 사용 기록을 읽어와 면학실 좌석표에 반영합니다.

document.addEventListener('DOMContentLoaded', () => {
  const leftTop = document.getElementById('t-seat-left-top')
  const leftBottom = document.getElementById('t-seat-left-bottom')
  const rightTop = document.getElementById('t-seat-right-top')
  const rightBottom = document.getElementById('t-seat-right-bottom')
  const bottomRow = document.getElementById('t-seat-bottom-row')

  const summaryText = document.getElementById('t-summary-text')
  const summaryMain = document.getElementById('t-summary-main')
  const summarySub = document.getElementById('t-summary-sub')
  const usageBody = document.getElementById('t-usage-body')

  if (
    !leftTop ||
    !leftBottom ||
    !rightTop ||
    !rightBottom ||
    !bottomRow ||
    !summaryText ||
    !summaryMain ||
    !summarySub ||
    !usageBody
  ) {
    console.warn('교사용 좌석 모니터링 페이지의 일부 요소를 찾지 못했습니다.')
    return
  }

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

  function getTodayDateStr() {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  function createSeatButton(seatNumber, usage) {
    const button = document.createElement('button')
    button.type = 'button'
    const occupied = !!usage && !usage.released

    button.className = 'seat ' + (occupied ? 'seat--occupied' : 'seat--available')

    const numberSpan = document.createElement('span')
    numberSpan.className = 'seat-number'
    numberSpan.textContent = String(seatNumber)
    button.appendChild(numberSpan)

    if (occupied) {
      const metaSpan = document.createElement('span')
      metaSpan.className = 'seat-meta'
      metaSpan.innerHTML = `${usage.studentId || '-'}<br />${usage.userName || ''}`
      button.appendChild(metaSpan)
    }

    return button
  }

  function renderSeatGroup(container, numbers, latestBySeat) {
    container.innerHTML = ''
    numbers.forEach((num) => {
      const usageRaw = latestBySeat.get(num) || null
      const usage = usageRaw && !usageRaw.released ? usageRaw : null
      container.appendChild(createSeatButton(num, usage))
    })
  }

  function renderUsageTable(latestBySeat) {
    usageBody.innerHTML = ''

    const rows = []
    latestBySeat.forEach((usage, seatNumber) => {
      if (usage && !usage.released) {
        rows.push({ seatNumber, ...usage })
      }
    })

    // 좌석 번호 순으로 정렬
    rows.sort((a, b) => a.seatNumber - b.seatNumber)

    rows.forEach((row) => {
      const tr = document.createElement('tr')
      tr.style.borderTop = '1px solid #e5e7eb'

      const tdSeat = document.createElement('td')
      tdSeat.style.padding = '4px 6px'
      tdSeat.textContent = String(row.seatNumber)

      const tdId = document.createElement('td')
      tdId.style.padding = '4px 6px'
      tdId.textContent = row.studentId || '-'

      const tdName = document.createElement('td')
      tdName.style.padding = '4px 6px'
      tdName.textContent = row.userName || ''

      const tdTime = document.createElement('td')
      tdTime.style.padding = '4px 6px'
      tdTime.textContent = row.time || ''

      const tdEmail = document.createElement('td')
      tdEmail.style.padding = '4px 6px'
      tdEmail.textContent = row.email || ''

      tr.appendChild(tdSeat)
      tr.appendChild(tdId)
      tr.appendChild(tdName)
      tr.appendChild(tdTime)
      tr.appendChild(tdEmail)

      usageBody.appendChild(tr)
    })
  }

  function renderSummary(latestBySeat, totalSeats) {
    let occupiedCount = 0
    latestBySeat.forEach((usage) => {
      if (usage && !usage.released) occupiedCount += 1
    })
    const availableCount = totalSeats - occupiedCount
    const today = getTodayDateStr()

    summaryText.textContent = `${today} 기준`
    summaryMain.textContent = `총 ${totalSeats}석 중 ${occupiedCount}석 사용 중`
    summarySub.textContent = `이용 가능: ${availableCount}석`
  }

  function subscribeToSeatUsage() {
    const today = getTodayDateStr()
    const q = query(collection(db, 'seatUsages'), where('date', '==', today))

    onSnapshot(
      q,
      (snapshot) => {
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

        renderSeatGroup(leftTop, layout.leftTop, latestBySeat)
        renderSeatGroup(leftBottom, layout.leftBottom, latestBySeat)
        renderSeatGroup(rightTop, layout.rightTop, latestBySeat)
        renderSeatGroup(rightBottom, layout.rightBottom, latestBySeat)
        renderSeatGroup(bottomRow, layout.bottom, latestBySeat)

        renderUsageTable(latestBySeat)
        renderSummary(latestBySeat, allSeatNumbers.length)
      },
      (error) => {
        console.error('좌석 사용 현황 구독 중 오류가 발생했습니다:', error)
        summaryText.textContent = '좌석 사용 현황을 불러오는 중 오류가 발생했습니다.'
      }
    )
  }

  // 초기 렌더링 (모두 비어 있는 좌석으로)
  const emptyUsage = new Map()
  renderSeatGroup(leftTop, layout.leftTop, emptyUsage)
  renderSeatGroup(leftBottom, layout.leftBottom, emptyUsage)
  renderSeatGroup(rightTop, layout.rightTop, emptyUsage)
  renderSeatGroup(rightBottom, layout.rightBottom, emptyUsage)
  renderSeatGroup(bottomRow, layout.bottom, emptyUsage)
  renderSummary(emptyUsage, allSeatNumbers.length)
  summaryText.textContent = '오늘 좌석 사용 데이터를 불러오는 중입니다.'

  // Firestore 실시간 구독 시작
  subscribeToSeatUsage()
})
