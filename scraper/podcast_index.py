#!/usr/bin/env python3
"""
Indexe ANISONG pour TV Rétro — UNIQUEMENT « La Belle Histoire des Génériques Télé ».

Les épisodes « ANISONG #NN | Interprète japonais (Série VO) » sont écartés :
ils traitent des génériques japonais, hors sujet pour les séries françaises.
Les « #SP | Interprète » de la Belle Histoire sont gardés en family=special
(claude lombard, bernard denimal…) : jamais matchés sur une série, affichés en bonus.

Sortie : data/podcasts/anisong.json
Usage  : python scraper/podcast_index.py
"""

import json, re, html, sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from xml.etree import ElementTree as ET

import requests

FEED="https://anisong.lepodcast.fr/rss"
OUT=Path("data/podcasts/anisong.json")
ITUNES="{http://www.itunes.com/dtds/podcast-1.0.dtd}"
CONTENT="{http://purl.org/rss/1.0/modules/content/}"
KEEP_PREFIX="la belle histoire des generiques tele"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; TVRetroBot/1.0; +https://github.com/xbodin2g/tv-retro)",
         "Accept":"application/rss+xml,application/xml,text/xml,*/*"}

ALIASES={
 "saint seiya":["les chevaliers du zodiaque","chevaliers du zodiaque"],
 "les chevaliers du zodiaque":["saint seiya"],
 "city hunter":["nick larson","nico larson"],"nick larson":["city hunter"],
 "macross":["robotech"],"robotech":["macross"],
 "captain tsubasa":["olive et tom"],"olive et tom":["captain tsubasa"],
 "maison ikkoku":["juliette je t aime"],"juliette je t aime":["maison ikkoku"],
 "kimagure orange road":["max et compagnie"],"max et compagnie":["kimagure orange road"],
 "lupin the 3rd":["edgar de la cambriole","lupin iii"],"edgar de la cambriole":["lupin the 3rd"],
 "goldorak":["ufo robot grendizer","grendizer"],
 "gatchaman":["la bataille des planetes"],"la bataille des planetes":["gatchaman"],
 "ken le survivant":["hokuto no ken"],"dr slump":["docteur slump"],
 "high school kimengumi":["le college fou fou fou"],"le college fou fou fou":["high school kimengumi"],
 "ranma 1 2":["ranma"],"yuyu hakusho":["yu yu hakusho"],
 "mon voisin totoro":["tonari no totoro"],
 "kiki la petite sorciere":["kiki s delivery service","majo no takkyubin"],
 "princesse mononoke":["mononoke hime"],
 "nadia le secret de l eau bleue":["fushigi no umi no nadia","nadia"],
 "tom sawyer":["tom sawyer no boken"],"heidi":["arupusu no shojo haiji"],
 "candy candy":["candy"],"candy":["candy candy"],
 "x or":["uchuu keiji gavan","gavan"],"bioman":["choudenshi bioman"],
 "wingman":["yume senshi wingman"],"sherlock holmes":["meitantei holmes"],
 "sous le signe des mousquetaires":["anime sanjushi"],
 "chroniques de la guerre de lodoss":["lodoss tosenki","record of lodoss war"],
 "le petit lord":["shokoshi cedie"],
 "dans les alpes avec annette":["alps monogatari watashi no annette"],
 "emi magique":["maho no star magical emi"],"erika":["idol tenshi eriko"],
 "sakura chasseuse de cartes":["card captor sakura"],
 "creamy":["creamy merveilleuse petite magicienne"],
 "tortues ninja":["teenage mutant ninja turtles","les tortues ninja"],
 "les mysterieuses cites d or":["les mysterieuses cites d or"],
 "alice au pays de smerveilles":["alice au pays des merveilles"],
 "spider man":["l araignee","spiderman"],
 "sherif fais moi peur":["ducats of hazzard","the dukes of hazzard"],
 "les quatre fantastiques":["the fantastic four"],
 "la bande a picsou":["ducktales"],"olive et tom champions de foot":["captain tsubasa"],
}
STOP={"la belle histoire des generiques tele","anisong","sp","hs","hors serie","v2","v3"}


def norm(v:str)->str:
    t=html.unescape(str(v or "")).strip().lower()
    for a,b in (("é","e"),("è","e"),("ê","e"),("ë","e"),("à","a"),("â","a"),("ä","a"),
                ("ù","u"),("û","u"),("ü","u"),("ô","o"),("ö","o"),("î","i"),("ï","i"),
                ("ì","i"),("ç","c"),("ñ","n"),("œ","oe"),("æ","ae")):
        t=t.replace(a,b)
    t=t.replace("’","'").replace("'"," ")
    return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9\s]"," ",t)).strip()
def strip_html(v): return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>"," ",str(v or "")))).strip()
def dur_seconds(v):
    v=str(v or "").strip()
    if not v: return 0
    if v.isdigit(): return int(v)
    try: parts=[int(p) for p in v.split(":")]
    except Exception: return 0
    s=0
    for p in parts: s=s*60+p
    return s
def fmt_dur(sec):
    if not sec: return ""
    h,m,s=sec//3600,(sec%3600)//60,sec%60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
def iso_date(v):
    try:
        d=parsedate_to_datetime(v)
        if d.tzinfo is None: d=d.replace(tzinfo=timezone.utc)
        return d.astimezone(timezone.utc).strftime("%Y-%m-%d")
    except Exception: return ""

PAREN=re.compile(r"\(([^)]{2,90})\)")
BRACK=re.compile(r"\[([^\]]{1,20})\]")

def parse_title(raw):
    t=html.unescape(raw or "").strip()
    version=1
    for v in BRACK.findall(t):
        m=re.match(r"^V\s*(\d+)$",v.strip(),re.I)
        if m: version=int(m.group(1))
    clean=BRACK.sub("",t).strip()
    parens=[p.strip() for p in PAREN.findall(clean)]
    body=PAREN.sub("",clean).strip()
    number=""
    m=re.search(r"#\s*([0-9]+|SP|HS)",body,re.I)
    if m: number=m.group(1).upper()
    subject=body.split("|",1)[1].strip() if "|" in body else re.sub(r"^.*?#\s*(?:[0-9]+|SP|HS)\s*","",body,flags=re.I).strip()
    subject=subject.strip(" -–—:|")
    special=number in ("SP","HS")
    return ("special" if special else "serie"),number,version,subject,parens

def build_keys(family,subject,parens,desc):
    works=[];persons=[]
    if family=="serie":
        if subject: works.append(subject)
        works.extend(parens)
    else:
        if subject: persons.append(subject)
    keys=set();nw=[];np=[]
    for w in works:
        k=norm(w)
        if not k or k in STOP or len(k)<3: continue
        if k not in nw: nw.append(k)
        keys.add(k)
        for a in ALIASES.get(k,[]): keys.add(norm(a))
    for p in persons:
        k=norm(p)
        if k and len(k)>=3 and k not in np: np.append(k)
    cited=set()
    for m in PAREN.finditer(desc or ""):
        k=norm(m.group(1))
        if k and k not in STOP and 3<=len(k)<=60: cited.add(k)
    return sorted(keys),nw,np,sorted(cited)


def main():
    print("="*78); print("🎧 INDEXATION ANISONG — La Belle Histoire des Génériques Télé"); print("="*78)
    print(f"Source : {FEED}")
    try:
        r=requests.get(FEED,headers=HEADERS,timeout=60); r.raise_for_status()
    except Exception as e:
        print(f"❌ Téléchargement impossible : {e}"); sys.exit(1)
    try: root=ET.fromstring(r.content)
    except Exception as e:
        print(f"❌ XML invalide : {e}"); sys.exit(1)
    chan=root.find("channel")
    if chan is None: print("❌ Pas de <channel>"); sys.exit(1)
    def ctext(tag,d=""):
        el=chan.find(tag); return (el.text or d).strip() if el is not None else d
    feed_title=html.unescape(ctext("title","ANISONG"))
    feed_link=ctext("link","https://anisong.fr/")
    im=chan.find(f"{ITUNES}image"); feed_image=im.get("href") if im is not None else ""
    if not feed_image:
        i2=chan.find("image")
        if i2 is not None:
            u=i2.find("url"); feed_image=(u.text or "").strip() if u is not None else ""

    raw_items=chan.findall("item")
    print(f"Items dans le flux : {len(raw_items)}")
    items=[];wc={};pc={};kept=0;dropped=0;dropped_samples=[]
    for it in raw_items:
        def t(tag,d=""):
            el=it.find(tag); return (el.text or d).strip() if el is not None else d
        title=html.unescape(t("title"))
        if not title: continue
        if not norm(title).startswith(KEEP_PREFIX):
            dropped+=1
            if len(dropped_samples)<5: dropped_samples.append(title)
            continue
        kept+=1
        link=t("link"); guid=t("guid") or link or title
        pub=iso_date(t("pubDate")); secs=dur_seconds(t(f"{ITUNES}duration"))
        enc=it.find("enclosure")
        audio=enc.get("url","") if enc is not None else ""
        mime=enc.get("type","audio/mpeg") if enc is not None else ""
        size=int(enc.get("length") or 0) if enc is not None else 0
        if not audio:
            el=it.find("guid")
            if el is not None:
                u=(el.text or "").strip()
                if u.startswith("http") and re.search(r"\.(mp3|m4a|ogg)(\?|$)",u,re.I): audio=u
        desc=strip_html(t(f"{CONTENT}encoded") or t("description"))
        ep=t(f"{ITUNES}episode"); etype=t(f"{ITUNES}episodeType","full")
        ii=it.find(f"{ITUNES}image"); image=ii.get("href") if ii is not None else feed_image
        family,number,version,subject,parens=parse_title(title)
        keys,nw,np,cited=build_keys(family,subject,parens,desc)
        for k in nw: wc[k]=wc.get(k,0)+1
        for k in np: pc[k]=pc.get(k,0)+1
        items.append({"id":guid,"title":title,"link":link,"audio":audio,"mime":mime,"bytes":size,
                      "date":pub,"duration":fmt_dur(secs) or t(f"{ITUNES}duration"),"seconds":secs,
                      "episode":ep or number,"number":number,"version":version,"type":etype,
                      "family":family,"subject":subject,"works":nw,"persons":np,"cited":cited,
                      "keys":keys,"image":image,"desc":desc[:900]})
    items.sort(key=lambda x:(x["date"] or "",int(x["number"]) if x["number"].isdigit() else 0),reverse=True)
    works=[{"key":k,"count":v} for k,v in sorted(wc.items(),key=lambda kv:-kv[1])]
    persons=[{"key":k,"count":v} for k,v in sorted(pc.items(),key=lambda kv:-kv[1])]
    payload={"source":FEED,"title":feed_title,"link":feed_link,"image":feed_image,
             "filter":"La Belle Histoire des Génériques Télé uniquement",
             "generated_at":datetime.now(timezone.utc).isoformat(),
             "refresh":"weekly","count":len(items),
             "with_audio":sum(1 for i in items if i["audio"]),
             "excluded":dropped,"excluded_samples":dropped_samples,
             "families":{f:sum(1 for i in items if i["family"]==f) for f in ("serie","special")},
             "latest":items[0]["date"] if items else "",
             "works":works,"persons":persons,"items":items}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    with open(OUT,"w",encoding="utf-8") as f: json.dump(payload,f,ensure_ascii=False,separators=(",",":"))
    print(f"\n✅ {OUT} écrit")
    print(f"   retenus : {kept} · écartés (ANISONG / hors sujet) : {dropped}")
    for s in dropped_samples: print(f"      ✗ {s}")
    print(f"   avec audio : {payload['with_audio']} · séries : {payload['families']['serie']} · bonus : {payload['families']['special']}")
    print(f"   œuvres indexées : {len(works)} · dernier épisode : {payload['latest']}")
    multi=[k for k,v in wc.items() if v>1]
    print(f"   {len(multi)} œuvre(s) multi-versions : "+", ".join(multi[:12]))
    print("\n   Top œuvres :")
    for w in works[:15]: print(f"     {w['count']:>2} × {w['key']}")
    if payload["with_audio"]<len(items):
        print(f"\n⚠️ {len(items)-payload['with_audio']} sans enclosure — le lien web reste proposé.")


if __name__=="__main__": main()