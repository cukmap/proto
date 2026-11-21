# cukmap 시안 모음 (proto)

키스톤디자인 T16이 cukmap 지도 위에 만들어 보는 하위 주소 프로젝트 시안이에요. 11월 26일 조별 모임에서 하나를 고르고, 나머지 주소는 반납해요.

| 시안 | 주소 | 한 줄 |
|---|---|---|
| quest | quest.cukmap.com | 지도와 실제 학교의 다른 점을 찾아 학과 점수 올리기 |
| land | land.cukmap.com | 건물 면·층을 질문에 답해 학과 색으로 차지하기 |
| canvas | canvas.cukmap.com | 현장 퀘스트로 물감을 모아 3D 학교에 함께 그리기 |
| cats | cats.cukmap.com | 골목 곳곳의 캠퍼스 고양이 모으기 |

모두 서버 없이 가짜 데이터로 움직이는 시안이에요. 지도는 cukmap 지도 부품(https://cukmap.com/kit/v1/cukmap.js)을 써요.
`tools/make_quests.py`는 cukmap 지도 데이터에서 퀘스트를 자동으로 만들어요.
