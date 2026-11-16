import json,re,os,collections
from pyproj import Transformer
T='https://heritagedata.maps.arcgis.com/apps/webappviewer/index.html?id=0c9eb9575b544081b0d296436d8f60f8&query=18a4b61b268-layer-9%2CSMRS%2C'
d=json.load(open('smr_roi.json'))
tt=lambda s:' '.join(w[:1].upper()+w[1:].lower() if w.isupper() or w.islower() else w for w in (s or '').strip().split()).replace("'S ","'s ")
drop=collections.Counter(); cells=collections.defaultdict(list); bad=0
RED=re.compile(r'redundant record|double-up record|duplicate record|database management error',re.I)
for x in d:
    c=x['MONUMENT_CLASS'] or ''
    if c=='Excavation - miscellaneous': drop['ROI Excavation - miscellaneous']+=1; continue
    if '(present location)' in c: drop['ROI (present location): object moved from its site']+=1; continue
    if re.search(r'redundant|non-antiquity|natural feature',c,re.I): drop['ROI '+c]+=1; continue
    if x['WEB_NOTES'] and RED.search(x['WEB_NOTES']): drop['ROI notes say redundant/duplicate']+=1; continue
    if x['WEBSITE_LINK']!=T+x['SMRS']: bad+=1
    e,n=x['ITM_E'],x['ITM_N']
    cells[(int(e//10000),int(n//10000))].append(['SMR',x['SMRS'].rstrip('-'),c,(tt(x['TOWNLAND'])+', Co. '+tt(x['COUNTY'])).strip(', '),'',round(x['LATITUDE'],6),round(x['LONGITUDE'],6)])
print('link template mismatches',bad)
ni=json.load(open('nismr.geojson'))['features']
t=Transformer.from_crs(29902,4326,always_xy=True); ti=Transformer.from_crs(4326,2157,always_xy=True)
NONSITE={'NON-ANTIQUITY','NON ANTIQUITY','NATURAL FEATURE','DUPLICATE','PLACENAME','FINDSPOT','FOLKLORE SITE','NATURAL HARBOUR'}
CO={'ANT':'Co. Antrim','ARM':'Co. Armagh','DOW':'Co. Down','FER':'Co. Fermanagh','LDY':'Co. Londonderry','TYR':'Co. Tyrone'}
for f in ni:
    p=f['properties']; ty=(p['Edited_Typ'] or p['General_Ty'] or '').strip()
    if ty.upper() in NONSITE or (p['General_Ty'] or '').strip().upper() in NONSITE: drop['NI '+((p['General_Ty'] or '').strip().upper() if (p['General_Ty'] or '').strip().upper() in NONSITE else ty.upper())]+=1; continue
    if (p.get('Located') or '').strip().lower()=='unlocated': drop['NI unlocated (no reliable position)']+=1; continue
    lo,la=t.transform(p['X'],p['Y']); e,n=ti.transform(lo,la)
    per=tt(p['General_Pe']) if p['General_Pe'] and p['General_Pe'].strip().upper() not in ('UNCERTAIN','') else ''
    prot=p['Protection'].strip()
    tw=tt(p['Townland_s'])+(', '+CO.get(p['SMRNo'][:3],'') if p['SMRNo'][:3] in CO else '')
    cells[(int(e//10000),int(n//10000))].append(['NISMR',p['SMRNo'],tt(ty),tw+(' · '+prot if prot and prot!='Descheduled' else ''),per,round(la,6),round(lo,6),p['MONID']])
os.makedirs('smr_cells',exist_ok=True); tot=0
for (cx,cy),L in cells.items():
    json.dump({'f':L},open(f'smr_cells/{cx}_{cy}.json','w'),separators=(',',':'),ensure_ascii=False); tot+=len(L)
json.dump({'cell':10000,'crs':'EPSG:2157','keys':sorted(f'{a}_{b}' for a,b in cells),'n':tot,'built':'2026-11-16','dropped':dict(drop)},open('smr_cells/index.json','w'),separators=(',',':'))
print(tot,len(cells),dict(drop))
