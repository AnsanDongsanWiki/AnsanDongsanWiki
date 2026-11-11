import {categories} from './core.js';
export const documentSortOptions={latest:'최신순',oldest:'오래된순',views:'조회순'};
export function listingState(params){
 return {
  category:categories.includes(params.get('category'))?params.get('category'):'',
  query:(params.get('q')||'').trim().slice(0,120),
  sort:Object.hasOwn(documentSortOptions,params.get('sort'))?params.get('sort'):'latest',
  page:Math.max(0,Math.min(10000,parseInt(params.get('p'),10)||0))
 };
}
export function listingUrl(state,changes={}){
 const next={...state,...changes};
 return `#home?${new URLSearchParams({category:next.category,q:next.query,sort:next.sort,p:String(next.page)})}`;
}
export async function loadDocumentListing(client,state,previewPages=[]){
 if(client){
  const result=await client.rpc('list_wiki_pages',{p_category:state.category,p_query:state.query,p_sort:state.sort,p_page:state.page});
  if(result.error)throw result.error;
  const pages=result.data||[];return {pages,count:Number(pages[0]?.total_count||0)};
 }
 const matches=previewPages.filter(p=>(!state.category||p.category===state.category)&&p.title.toLocaleLowerCase('ko-KR').includes(state.query.toLocaleLowerCase('ko-KR'))).map(p=>({...p,views:0}));
 matches.sort((a,b)=>{
  const difference=new Date(a.updated_at)-new Date(b.updated_at);
  return (state.sort==='oldest'?difference:-difference)||String(a.id).localeCompare(String(b.id));
 });
 return {pages:matches.slice(state.page*24,state.page*24+24),count:matches.length};
}
