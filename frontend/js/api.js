export const API='http://localhost:4000/api/v1';
async function request(path, options={}){const r=await fetch(`${API}${path}`,options);let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||d.detail||`Request failed (${r.status})`);return d}
export const getHealth=()=>request('/health');
export const uploadPdf=file=>{const f=new FormData();f.append('file',file);return request('/upload',{method:'POST',body:f})};
export const getDashboard=id=>request(`/dashboard/${id}`);
export const askQuestion=(documentId,query,section)=>request('/query',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentId,query,filters:{section:section||undefined}})});
export const getAnomalies=id=>request(`/anomalies/${id}`);
export const getOutlook=id=>request(`/outlook/${id}`);
export const getTemplates=()=>request('/report-templates');
export const generateReport=(documentId,template)=>request('/generate-report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentId,template})});
