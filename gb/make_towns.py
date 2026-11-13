# Towns, villages and islands for place search in the GB lens's newer areas: Scotland (incl. Highlands and Islands, Orkney, Shetland),
# the Isle of Man and the Channel Islands. Source: GeoNames (CC BY 4.0), feature classes P (populated places) and T.ISL (islands).
import csv,json,sys,collections
csv.field_size_limit(10**8)
A2={}
for r in csv.reader(open('admin2Codes.txt',encoding='utf8'),delimiter='\t'):
  A2[r[0]]=r[2] if len(r)>2 else r[1]
KIND={'PPLC':'city','PPLA':'town','PPLA2':'town','PPLA3':'town','PPLA4':'village','PPL':'village','PPLX':'district','PPLL':'village','PPLF':'village','PPLS':'village','PPLQ':None,'PPLH':None,'PPLW':None,'ISL':'island','ISLS':'islands'}
AREA={'IM':'Isle of Man','JE':'Jersey','GG':'Guernsey'}
out=[];seen=set()
for cc in ('GB','IM','JE','GG'):
  for r in csv.reader(open(cc+'.txt',encoding='utf8'),delimiter='\t',quoting=csv.QUOTE_NONE):
    fc,code=r[6],r[7]
    if not ((fc=='P') or (fc=='T' and code in ('ISL','ISLS'))): continue
    if cc=='GB' and r[10]!='SCT': continue
    k=KIND.get(code,'village' if fc=='P' else None)
    if not k: continue
    pop=int(r[14] or 0)
    if k=='village' and pop>=5000: k='town'
    if cc=='GB': area=A2.get(f'GB.SCT.{r[11]}','Scotland')
    else: area=A2.get(f'{cc}.{r[10]}.{r[11]}') if r[11] else None; area=(area+', ' if area and area!=AREA[cc] else '')+AREA[cc]
    name=r[1];alt=r[2] if r[2]!=r[1] else ''
    key=(name,round(float(r[4]),2),round(float(r[5]),2))
    if key in seen: continue
    seen.add(key)
    out.append([name,round(float(r[4]),5),round(float(r[5]),5),k,area,pop]+([alt] if alt else []))
rank={'city':0,'town':1,'islands':2,'island':2,'village':3,'district':4}
out.sort(key=lambda o:(rank[o[3]],-o[5],o[0]))
json.dump(out,open('towns.json','w',encoding='utf8'),ensure_ascii=False,separators=(',',':'))
print(len(out),collections.Counter(o[3] for o in out))
for q in ['Lerwick','Kirkwall','Stornoway','Portree','Bowmore','Tobermory','Fort William','Castletown','Ramsey','St Helier','Saint Helier','St Peter Port','Saint Peter Port','St Anne','Saint Anne','Islay','Jura']:
  print(q,'->',[o[:5] for o in out if o[0].lower()==q.lower() or (len(o)>6 and o[6].lower()==q.lower())][:3])
