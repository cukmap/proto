"""니콜스관 일대 퀘스트를 cukmap 지도 데이터에서 자동으로 만든다.
입력: cukmap/map 데이터(출입구·보행망), cukmap/indoor 니콜스관 층 자료(있으면)
출력: data/quests.json"""
import json, os, sys
def josa(w, a, b):
    c = ord(w[-1]) - 0xAC00
    return w + (a if 0 <= c <= 11171 and c % 28 else b)
MAP = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/cukmap'
IND = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/cukmap-indoor'
OUT = os.path.join(os.path.dirname(__file__), '..', 'quest', 'data', 'quests.json')
LAT0, LON0 = 37.4867837, 126.8013923
xz = lambda la, lo: (round((lo - LON0) * 88270, 1), round((LAT0 - la) * 110950, 1))
ZONE = {'name': '니콜스관 일대', 'box': [-60, 100, 10, 170],
        'buildings': ['니콜스관', '학생미래인재관', '다솔관', '밤비노관', '비르투스관']}
inb = lambda x, z: ZONE['box'][0] <= x <= ZONE['box'][1] and ZONE['box'][2] <= z <= ZONE['box'][3]
FLOORS = ['B1', '1F', '2F', '3F', '4F', '5F', '6F']
Q = []
def add(**k): Q.append(k)

# 1) 문: 출입구마다 "들어가면 몇 층?"
ents = json.load(open(f'{MAP}/dist/data/v1/entrances.json'))
ents = ents if isinstance(ents, list) else list(ents.values())[-1]
for e in ents:
    x, z = xz(*e['at'])
    if not inb(x, z) or not any(b in e['building'] for b in ZONE['buildings']): continue
    add(id='door-' + e['id'], type='문', building=e['building'], at=[x, z],
        title=e['name'], q='이 문으로 들어가면 건물 몇 층이에요?',
        options=FLOORS + ['문이 없어요'], map=(e['floor'] or None),
        why='언덕 때문에 건물마다 들어가는 층이 달라요.')

# 2) 연결: 건물끼리 이어지는 통로
edges = json.load(open(f'{MAP}/data/campuses/songsim/network/edges.json'))
nodes = json.load(open(f'{MAP}/data/campuses/songsim/network/nodes.json'))
for e in edges:
    if e.get('kind') != 'inter_building' or '니콜스관' not in (e.get('note') or ''): continue
    a, b = [s.strip() for s in e['note'].replace('연결', '').split('↔')]
    g = e['g']; x, z = g[len(g) // 2]
    other = b.split(' ')[0]
    add(id='link-' + e['id'], type='연결', building='니콜스관', at=[round(x, 1), round(z, 1)],
        title=f'니콜스관 ↔ {other}', q=f'니콜스관 몇 층에서 {other}(으)로 바로 건너갈 수 있어요?'.replace('(학생미래인재관)(으)로', '(학생미래인재관)으로').replace('다솔관(으)로', '다솔관으로'),
        options=['1F', '2F', '3F', '4F', '5F', '못 건너가요'], map=a.split(' ')[-1], extra=e['note'],
        why='건물끼리 서로 다른 층으로 이어져 있어요.')

# 3) 길: 영상 판독·자동 연결로 추정한 길(확신도 C)
for e in edges:
    if e['cf'] != 'C' or e['t'] not in ('walk', 'steps', 'trail'): continue
    g = e['g']; x, z = g[len(g) // 2]
    if not inb(x, z): continue
    add(id='path-' + e['id'], type='길', building=None, at=[round(x, 1), round(z, 1)],
        title=e['nm'] or '이름 없는 길', q='이 길로 지나갈 수 있어요?',
        options=['네, 걸어서', '계단이 있어요', '막혀 있어요'], map='네, 걸어서',
        why='사진으로만 그린 길이라 현장 확인이 필요해요.')

# 4) 실내 계단·강의실 (니콜스관 도면이 있을 때만)
ind = f'{IND}/data/campuses/songsim/buildings/nichols/indoor'
if os.path.isdir(ind):
    shafts, rooms = [], {}
    for fl in ['1F', '2F', '3F', '4F', '5F']:
        f = json.load(open(f'{ind}/{fl}.json'))
        for s in f['stairs']:
            for c in shafts:
                if abs(c['x'] - s['x']) < 6 and abs(c['z'] - s['z']) < 6: c['fl'].add(fl); break
            else: shafts.append({'x': s['x'], 'z': s['z'], 'fl': {fl}})
        for l in f['labels']: rooms.setdefault(l['id'], (fl, l['x'], l['z']))
    # OT 「전공과의 만남」 강의실 중 층마다 1개
    for r in ['N103', 'N208', 'N312', 'N410']:
        if r not in rooms: continue
        fl, x, z = rooms[r]
        # 위치는 넣지 않고 강의실 번호만 둔다(위치는 지도 부품이 실내 자료에서 찾음 — 비공개 도면 좌표를 공개 저장소에 복사하지 않기 위해)
        add(id='room-' + r, type='강의실', building='니콜스관', room=r, floor=fl,
            title=r, q=f'{r} 강의실이 지도의 이 자리가 맞아요?', options=['맞아요', '조금 달라요', '전혀 달라요'], map='맞아요',
            why='2026 신입생 OT 「전공과의 만남」 강의실이에요.')

# 5) 찾기: 데이터가 없어도 만들 수 있는 질문
cnt = {b: sum(1 for q in Q if q['type'] == '문' and b in (q['building'] or '')) for b in ZONE['buildings']}
bl = json.load(open(f'{MAP}/dist/data/v1/buildings.json')); bl = bl if isinstance(bl, list) else list(bl.values())[-1]
for b in bl:
    if b['name'] not in ZONE['buildings']: continue
    x, z = xz(*b['center'])
    add(id='find-door-' + b['code'], type='찾기', building=b['name'], at=[x, z],
        title=f'{b["name"]}의 숨은 출입구', q=f'지도에 없는 {b["name"]} 출입구가 있나요? 있다면 위치를 찍어 주세요.',
        options=['찍기'], map=f'지도에 출입구 {cnt[b["name"]]}개',
        why='지도에 빠진 문을 찾으면 큰 점수예요.')
for i, (nm, x, z) in enumerate([('니콜스관–학생미래인재관 사이', 20, 60), ('니콜스관–다솔관 사이', 10, 120),
                                 ('밤비노관·비르투스관 주변', 55, 125), ('고양이길 주변', 45, 157)]):
    add(id=f'find-path-{i+1}', type='찾기', building=None, at=[x, z], title=nm,
        q='이 근처에 지도(지상 시점)에 없는 계단·샛길·옹벽이 있나요? 있다면 위치를 찍어 주세요.', options=['찍기'], map=None,
        why='큰길 말고 학생들만 아는 길을 찾아요.')

# 6) 3D 겉모습: building.json 값에서 (층수·외벽·창문·1층 구조)
import colorsys
def wall_name(h):
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (1, 3, 5)); hh, l, sat = colorsys.rgb_to_hls(r, g, b)
    if sat < 0.15: return '흰색·회색' if l > 0.6 else '짙은 회색'
    if hh < 0.08 or hh > 0.95: return '벽돌'
    return '크림·베이지'
WIN = {'ribbon': '가로로 길게 이어진 띠창', 'punched': '하나씩 떨어진 창', 'curtain': '건물 전체가 유리'}
SLUG = {'니콜스관': 'nichols', '학생미래인재관': 'mirae', '다솔관': 'dasol', '밤비노관': 'bambino', '비르투스관': 'virtus'}
first_door = {}
for q in Q:
    if q['type'] == '문':
        for b in SLUG:
            if b in q['building'] and b not in first_door: first_door[b] = q['at']
for b, slug in SLUG.items():
    j = json.load(open(f'{MAP}/data/campuses/songsim/buildings/{slug}/building.json'))
    parts = j['spec']['parts']; at = first_door.get(b) or list(xz(*[x for x in bl if x['name'] == b][0]['center']))
    led = j.get('ledger', {}); fl = max(p['floors'] + round(p.get('base', 0) / 3.6) for p in parts)
    vals = [led.get('floorsAbove'), j.get('ngiiFloors'), fl]
    src = ('자료끼리도 달라요: ' if len(set(vals)) > 1 else '자료: ') + f"건축물대장 지상 {vals[0]}층 · 수치지도 {vals[1]}층 · 지금 지도 {vals[2]}층"
    add(id='levels-' + slug, type='층수', building=b, at=at, title=f'{b} 층수',
        q=f'이 자리에서 {josa(b, "을", "를")} 보면 땅 위로 몇 층이 보여요?', options=['1층', '2층', '3층', '4층', '5층', '6층', '7층 이상'],
        map=f'{fl}층', why='언덕이라 보는 쪽마다 층수가 달라 보여요.', after=src)
    w = parts[0]
    add(id='wall-' + slug, type='겉모습', building=b, at=at, title=f'{b} 외벽',
        q=f'{b} 외벽은 주로 무슨 색·재료예요?', options=['벽돌', '흰색·회색', '크림·베이지', '유리', '여러 가지가 섞임'],
        map=wall_name(w['wall']), why='3D 건물의 색을 정해요. 색 이름은 사람마다 달라서 크게만 묻고, 정확한 색은 비교 퀘스트 사진에서 가져와요.')
    add(id='win-' + slug, type='겉모습', building=b, at=at, title=f'{b} 창문',
        q=f'{b} 창문은 어떤 모양이에요?', options=list(WIN.values()) + ['여러 가지가 섞임'],
        map=WIN.get(w.get('win'), None), why='3D 건물의 창 모양을 정해요.')
    add(id='ground-' + slug, type='겉모습', building=b, at=at, title=f'{b} 1층',
        q=f'{b} 1층은 어떻게 생겼어요?', options=['벽으로 막혀 있음', '기둥만 있고 비어 있음(필로티)', '입구 위에 지붕(차양)이 튀어나옴'],
        map='기둥만 있고 비어 있음(필로티)' if any(p.get('pilotis') for p in parts) else '벽으로 막혀 있음', why='3D 건물 아래쪽 모양을 정해요.')
    add(id='compare-' + slug, type='비교', building=b, at=at, title=f'{b} 앞에서 비교',
        q='지상 시점 화면과 실제 모습을 나란히 보세요. 가장 크게 다른 점은?', options=['건물 모양', '색', '창문', '계단·언덕', '나무·기타', '거의 똑같아요'],
        map='거의 똑같아요', photo=True, why='같은 각도 사진은 3D를 고치는 사람에게 가장 좋은 근거예요.')

# 7) 지형: CAD 옹벽 선이 몰린 곳
for i, (x, z, t) in enumerate([(99, 78, '니콜스관 동쪽 옹벽'), (91, 70, '니콜스관 동쪽 단차')]):
    add(id=f'terrain-{i+1}', type='지형', building=None, at=[x, z], title=t,
        q='여기 땅 높이가 바뀌는 곳은 어떻게 생겼어요?', options=['옹벽(사람 키보다 낮음)', '옹벽(사람 키보다 높음)', '계단', '경사로', '평평해요'],
        map=None, photo=True, why='도면의 선만 있고 높이는 몰라요. 3D 지형을 정해요.')

# 지상 시점 비교용 서 있을 자리: 문 앞 보행망 위의 점(건물 밖, 문에서 10~35m, 건물 바깥쪽 방향)에서 건물을 바라봄
import math, glob
BP = {json.load(open(f))['name']: json.load(open(f))['poly'] for f in glob.glob(f'{MAP}/data/campuses/songsim/buildings/*/building.json')}
POLYS = list(BP.values())
def inside(x, z, poly):
    c = False; j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]; xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi: c = not c
        j = i
    return c
TREES = [(t[0], t[1], t[3]) for t in json.load(open(f'{MAP}/data/campuses/songsim/campus/vegetation.json')).get('trees', [])]
def under_tree(x, z): return any(math.hypot(x - a, z - b) < r + 1.5 for a, b, r in TREES)
def near_bld(x, z, m=4):
    return any(inside(x + dx, z + dz, P) for P in POLYS for dx, dz in [(0, 0), (m, 0), (-m, 0), (0, m), (0, -m)])
CAND = [(n['x'], n['z']) for n in nodes] + [tuple(pt) for e in edges if e['t'] in ('walk', 'road_campus', 'steps') for pt in e['g']]
CEN = {b['name']: xz(*b['center']) for b in bl}
for q in Q:
    if q.get('room') or not q.get('building'): continue
    c = next((v for k, v in CEN.items() if k in q['building']), None)
    if not c: continue
    ox, oz = q['at'][0] - c[0], q['at'][1] - c[1]; L = math.hypot(ox, oz) or 1; ox, oz = ox / L, oz / L
    best = None
    for strict in (True, False):
     if best: break
     for x, z in CAND:
         dx, dz = x - q['at'][0], z - q['at'][1]; d = math.hypot(dx, dz)
         if not 12 <= d <= (45 if strict else 70) or near_bld(x, z) or (strict and under_tree(x, z)): continue
         tgt = next((P for k, P in BP.items() if k in q['building']), None)
         blocked = False
         for t in range(1, 40):   # 서 있는 자리 → 문 사이에 다른 건물이 끼면 안 됨
             px, pz = x + (q['at'][0] - x) * t / 40, z + (q['at'][1] - z) * t / 40
             if any(inside(px, pz, P) for P in POLYS if P is not tgt) or (strict and t <= 12 and under_tree(px, pz)): blocked = True; break
         if blocked: continue
         score = (dx * ox + dz * oz) / d - abs(d - 25) / 40   # 문 바깥쪽 + 20m 안팎
         if best is None or score > best[0]: best = (score, x, z)
    if best: q['stand'] = [round(best[1], 1), round(best[2], 1)]
    q['look'] = q['building'].split('(')[0]

json.dump({'zone': ZONE, 'quests': Q}, open(OUT, 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(Q), Counter(q['type'] for q in Q))
