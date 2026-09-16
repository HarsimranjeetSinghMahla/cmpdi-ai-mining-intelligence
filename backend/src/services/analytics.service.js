import { getDb } from '../db/mongodb.js';

const metricPatterns = [
  { name:'Production', category:'operations', unitPattern:'(?:MT|million tonnes|tonnes|tons|MTPA)', re:/\bproduction\b[^\d]{0,80}([\d,.]+)\s*(MT|million tonnes|tonnes|tons|MTPA)\b/ig },
  { name:'Reserves', category:'resources', unitPattern:'(?:MT|million tonnes|tonnes)', re:/\breserves?\b[^\d]{0,80}([\d,.]+)\s*(MT|million tonnes|tonnes)\b/ig },
  { name:'Resources', category:'resources', unitPattern:'(?:MT|million tonnes|tonnes)', re:/\bresources?\b[^\d]{0,80}([\d,.]+)\s*(MT|million tonnes|tonnes)\b/ig },
  { name:'Ash', category:'quality', unitPattern:'%', re:/\bash\b[^\d]{0,50}([\d,.]+)\s*%/ig },
  { name:'Moisture', category:'quality', unitPattern:'%', re:/\bmoisture\b[^\d]{0,50}([\d,.]+)\s*%/ig },
  { name:'Grade', category:'quality', unitPattern:'%', re:/\bgrade\b[^\d]{0,50}([\d,.]+)\s*%/ig },
  { name:'Boreholes', category:'exploration', unitPattern:'count', re:/\b(?:boreholes?|bore holes)\b[^\d]{0,50}([\d,]+)\b/ig }
];

function num(v){ const n=Number(String(v).replace(/,/g,'')); return Number.isFinite(n)?n:null; }
function cleanText(s){ return String(s||'').replace(/\s+/g,' ').trim(); }

function extractMetrics(pages){
  const metrics=[];
  for(const p of pages){
    for(const pattern of metricPatterns){
      pattern.re.lastIndex=0;
      let m;
      while((m=pattern.re.exec(p.text||''))){
        const value=num(m[1]); if(value===null) continue;
        metrics.push({name:pattern.name,value,unit:m[2]||pattern.unitPattern,category:pattern.category,sourcePage:p.page,confidence:0.72,context:cleanText((p.text||'').slice(Math.max(0,m.index-90),m.index+Math.min(180,(p.text||'').length-m.index)))});
        if(metrics.filter(x=>x.name===pattern.name&&x.sourcePage===p.page).length>=4) break;
      }
    }
  }
  return metrics.slice(0,200);
}

function extractSeries(pages){
  const series=[];
  for(const p of pages){
    const text=p.text||'';
    const re=/\b(20\d{2})\b[^\n\d]{0,40}([\d,]+(?:\.\d+)?)\s*(MT|MTPA|million tonnes|tonnes|tons|%)?/g;
    let m; while((m=re.exec(text))){
      const value=num(m[2]); if(value===null) continue;
      series.push({year:Number(m[1]),value,unit:m[3]||null,sourcePage:p.page,context:cleanText(text.slice(Math.max(0,m.index-70),m.index+140))});
    }
  }
  const grouped={};
  for(const x of series){ const k=x.unit||'unknown'; (grouped[k]??=[]).push(x); }
  return Object.entries(grouped).map(([unit,values])=>({unit,values:values.sort((a,b)=>a.year-b.year).filter((v,i,a)=>i===0||v.year!==a[i-1].year)})).filter(s=>s.values.length>=3).slice(0,8);
}

function deriveInsights(metrics, series){
  const out=[];
  for(const s of series){
    const v=s.values; const a=v[v.length-2], b=v[v.length-1]; if(!a||!b||a.value===0) continue;
    const pct=((b.value-a.value)/Math.abs(a.value))*100;
    if(Math.abs(pct)>=8) out.push({category:'OPERATIONS',title:pct<0?'Production trend weakened':'Production trend improved',description:`The latest documented value changed ${Math.abs(pct).toFixed(1)}% from ${a.year} to ${b.year}.`,metric:`${b.value.toLocaleString()} ${s.unit||''}`.trim(),severity:Math.abs(pct)>=20?'HIGH':'MEDIUM',sourcePages:[a.sourcePage,b.sourcePage]});
  }
  for(const m of metrics.filter(x=>['Ash','Moisture'].includes(x.name)).slice(0,6)) out.push({category:'QUALITY',title:`${m.name} value detected`,description:`A documented ${m.name.toLowerCase()} value was extracted from the source evidence.`,metric:`${m.value} ${m.unit}`,severity:'INFO',sourcePages:[m.sourcePage]});
  return out.slice(0,12);
}

export async function getDashboard(documentId){
  const db=getDb(); const doc=await db.collection('documents').findOne({_id:documentId});
  if(!doc) return null;
  const pages=await db.collection('pages').find({documentId},{projection:{page:1,text:1,wordCount:1}}).sort({page:1}).toArray();
  const metrics=doc.analytics?.metrics||extractMetrics(pages);
  const series=doc.analytics?.series||extractSeries(pages);
  const insights=doc.analytics?.insights||deriveInsights(metrics,series);
  const evidenceCoverage=pages.length?Math.round((await db.collection('chunks').countDocuments({documentId})/Math.max(1,pages.length))*10):0;
  return {document:{id:doc._id,filename:doc.filename,createdAt:doc.createdAt},analytics:{...(doc.analytics||{}),metrics,series,sections:doc.analytics?.topSections||[],evidenceCoverage:Math.min(100,evidenceCoverage)},insights};
}

export function deriveAnomalies(dashboard){
  const anomalies=[];
  for(const s of dashboard?.analytics?.series||[]){
    const v=s.values||[]; for(let i=1;i<v.length;i++){ if(!v[i-1].value) continue; const pct=(v[i].value-v[i-1].value)/Math.abs(v[i-1].value)*100; if(Math.abs(pct)>=15) anomalies.push({severity:Math.abs(pct)>=30?'HIGH':'MEDIUM',title:`Significant ${s.unit||'metric'} movement`,description:`Documented value changed ${pct.toFixed(1)}% between ${v[i-1].year} and ${v[i].year}.`,metric:v[i].value,sourcePages:[v[i-1].sourcePage,v[i].sourcePage]}); }
  }
  return anomalies.slice(0,10);
}

export function projectSeries(dashboard){
  const candidate=(dashboard?.analytics?.series||[]).find(s=>s.values?.length>=4);
  if(!candidate) return {available:false,reason:'Insufficient historical data for projection.'};
  const v=candidate.values.slice(-5); const xs=v.map(x=>x.year), ys=v.map(x=>x.value); const n=ys.length; const mx=xs.reduce((a,b)=>a+b,0)/n, my=ys.reduce((a,b)=>a+b,0)/n; const slope=xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/Math.max(1,xs.reduce((s,x)=>s+(x-mx)**2,0)); const intercept=my-slope*mx; const projections=[1,2].map(k=>{const year=xs[xs.length-1]+k; return {year,value:Math.max(0,intercept+slope*year)};}); const mean=ys.reduce((a,b)=>a+b,0)/n; const rmse=Math.sqrt(ys.reduce((s,y,i)=>s+(y-(intercept+slope*xs[i]))**2,0)/n); const confidence=Math.max(0,Math.min(100,Math.round(100*(1-rmse/Math.max(1,Math.abs(mean)))))); return {available:true,label:candidate.unit||'documented metric',historical:v,projections,confidence,evidencePages:[...new Set(v.map(x=>x.sourcePage))]};
}
