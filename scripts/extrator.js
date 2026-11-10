const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const q=new URLSearchParams(location.search).get('q');
const t0=Date.now();
while(Date.now()-t0<10000){await sleep(700);if(/resultado|Nenhum anúncio|Nenhum resultado|não encontr/i.test(document.body.textContent))break}
let last=-1,st=0;
for(let i=0;i<35&&st<3&&Date.now()-t0<25000;i++){window.scrollTo(0,document.body.scrollHeight);await sleep(1100);const n=(document.body.textContent.match(/Identificação da biblioteca/g)||[]).length;if(n===last)st++;else{st=0;last=n}}
const t=document.body.innerText;
const M={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
const hoje=new Date();hoje.setHours(0,0,0,0);
const adv={};let oldest=null,n1=0,n7=0,soma=0;
for(const b of t.split(/Identificação da biblioteca: /).slice(1)){
 const d=b.match(/Veiculação iniciada em (\d+) de (\w{3})\.? de (\d{4})/);
 const a=((b.match(/\n([^\n]+)\nPatrocinado/)||[])[1]||'?').trim();
 const m=+((b.match(/(\d+) anúncios usam esse criativo/)||[])[1]||1);
 adv[a]=(adv[a]||0)+m;soma+=m;
 if(d){const dt=new Date(+d[3],M[d[2]]-1,+d[1]);const iso=`${d[3]}-${String(M[d[2]]).padStart(2,'0')}-${d[1].padStart(2,'0')}`;if(!oldest||iso<oldest)oldest=iso;const dias=(hoje-dt)/864e5;if(dias<=1)n1+=m;if(dias<=7)n7+=m;}
}
const tm=t.match(/~?([\d.]+) resultados?/);
const R=JSON.stringify({q,total:tm?+tm[1].replace(/\./g,''):(soma||(/Nenhum anúncio/.test(t)?0:null)),cards:Math.max(last,0),amostra:soma,adv,oldest,n1,n7})
try{const all=JSON.parse(sessionStorage.getItem('radarRes')||'{}');all[q]=JSON.parse(R);sessionStorage.setItem('radarRes',JSON.stringify(all))}catch(e){}
R
