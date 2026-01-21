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

  const centerTopLeft = document.getElementById('t-seat-center-top-left')
  const centerTopRight = document.getElementById('t-seat-center-top-right')
  const centerBottomLeft = document.getElementById('t-seat-center-bottom-left')
  const centerBottomRight = document.getElementById('t-seat-center-bottom-right')

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
    !centerTopLeft ||
    !centerTopRight ||
    !centerBottomLeft ||
    !centerBottomRight ||
    !summaryText ||
    !summaryMain ||
    !summarySub ||
    !usageBody
  ) {
    console.warn('교사용 좌석 모니터링 페이지의 일부 요소를 찾지 못했습니다.')
    return
  }

  const layout = {
    // 좌측 벽면 1~16
    leftTop: [1, 2, 3, 4, 5, 6, 7, 8],
    leftBottom: [9, 10, 11, 12, 13, 14, 15, 16],
    // 우측 벽면 23~42
    rightTop: [42, 41, 40, 39, 38, 37, 36, 35],
    rightBottom: [34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23],
    // 하단 17~22
    bottom: [17, 18, 19, 20, 21, 22],
    // 중앙 상단 블록 (43~98)
    centerTopLeft: [
      43, 44, 45, 46,
      51, 52, 53, 54,
      59, 60, 61, 62,
      67, 68, 69, 70,
      75, 76, 77, 78,
      83, 84, 85, 86,
      91, 92, 93, 94,
    ],
    centerTopRight: [
      47, 48, 49, 50,
      55, 56, 57, 58,
      63, 64, 65, 66,
      71, 72, 73, 74,
      79, 80, 81, 82,
      87, 88, 89, 90,
      95, 96, 97, 98,
    ],
    // 중앙 하단 블록 (99~130)
    centerBottomLeft: [
      99, 100, 101, 102,
      107, 108, 109, 110,
      115, 116, 117, 118,
      123, 124, 125, 126,
    ],
    centerBottomRight: [
      103, 104, 105, 106,
      111, 112, 113, 114,
      119, 120, 121, 122,
      127, 128, 129, 130,
    ],
  }

  const allSeatNumbers = [
    ...layout.leftTop,
    ...layout.leftBottom,
    ...layout.rightTop,
    ...layout.rightBottom,
    ...layout.bottom,
    ...layout.centerTopLeft,
    ...layout.centerTopRight,
    ...layout.centerBottomLeft,
    ...layout.centerBottomRight,
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
        const now = new Date()
        const isAfterCutoff = now.getHours() >= 21
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

        // 21시 이후에는 "21시 이전에 시작된 세션"은 자동 종료로 간주하고,
        // 21시 이후에 새로 신청한 좌석은 그대로 보여주기 위해 필터링 맵을 만든다.
        const filteredBySeat = new Map()
        latestBySeat.forEach((usage, seatNumber) => {
          let u = usage

          // 해제된 기록은 제외
          if (u && u.released) {
            u = null
          }

          if (u && isAfterCutoff) {
            let startedHour = null
            if (typeof u.time === 'string' && u.time.length >= 2) {
              const hh = parseInt(u.time.slice(0, 2), 10)
              if (!Number.isNaN(hh)) startedHour = hh
            } else if (u.clickedAt) {
              try {
                const d =
                  typeof u.clickedAt.toDate === 'function'
                    ? u.clickedAt.toDate()
                    : new Date(u.clickedAt)
                if (!Number.isNaN(d.getTime())) {
                  startedHour = d.getHours()
                }
              } catch {
                // 무시
              }
            }

            if (startedHour !== null && startedHour < 21) {
              u = null
            }
          }

          if (u) {
            filteredBySeat.set(seatNumber, u)
          }
        })

        renderSeatGroup(leftTop, layout.leftTop, filteredBySeat)
        renderSeatGroup(leftBottom, layout.leftBottom, filteredBySeat)
        renderSeatGroup(centerTopLeft, layout.centerTopLeft, filteredBySeat)
        renderSeatGroup(centerTopRight, layout.centerTopRight, filteredBySeat)
        renderSeatGroup(centerBottomLeft, layout.centerBottomLeft, filteredBySeat)
        renderSeatGroup(centerBottomRight, layout.centerBottomRight, filteredBySeat)
        renderSeatGroup(rightTop, layout.rightTop, filteredBySeat)
        renderSeatGroup(rightBottom, layout.rightBottom, filteredBySeat)
        renderSeatGroup(bottomRow, layout.bottom, filteredBySeat)

        renderUsageTable(filteredBySeat)
        renderSummary(filteredBySeat, allSeatNumbers.length)

        if (isAfterCutoff) {
          summaryText.textContent = `${getTodayDateStr()} 21시 이후 · 이전에 사용하던 좌석은 자동 종료로 간주됩니다.`
        } else {
          summaryText.textContent = `${getTodayDateStr()} 기준`
        }
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
  renderSeatGroup(centerTopLeft, layout.centerTopLeft, emptyUsage)
  renderSeatGroup(centerTopRight, layout.centerTopRight, emptyUsage)
  renderSeatGroup(centerBottomLeft, layout.centerBottomLeft, emptyUsage)
  renderSeatGroup(centerBottomRight, layout.centerBottomRight, emptyUsage)
  renderSeatGroup(rightTop, layout.rightTop, emptyUsage)
  renderSeatGroup(rightBottom, layout.rightBottom, emptyUsage)
  renderSeatGroup(bottomRow, layout.bottom, emptyUsage)
  renderSummary(emptyUsage, allSeatNumbers.length)
  summaryText.textContent = '오늘 좌석 사용 데이터를 불러오는 중입니다.'

  // Firestore 실시간 구독 시작
  subscribeToSeatUsage()
})
