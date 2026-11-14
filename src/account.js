export async function withdrawAccount(client,password,confirmation,fetcher=fetch){
 if(!password)throw new Error('현재 비밀번호를 입력해 주세요.');
 if(confirmation!=='회원탈퇴')throw new Error('확인 문구에 회원탈퇴를 정확히 입력해 주세요.');
 const session=await client.auth.getSession();
 if(session.error||!session.data?.session?.access_token)throw new Error('다시 로그인해 주세요.');
 const response=await fetcher('/api/delete-account',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.data.session.access_token}`},
  body:JSON.stringify({password,confirmation}),cache:'no-store'
 });
 let result;
 try{result=await response.json();}catch{throw new Error('탈퇴 처리가 완료됐는지 확인하지 못했습니다. 같은 계정으로 다시 시도해 주세요.');}
 if(!response.ok||result.deleted!==true)throw new Error(result.error||'회원탈퇴를 완료하지 못했습니다. 다시 시도해 주세요.');
 // Auth credentials are already removed on the server. Clear this browser too.
 try{await client.auth.signOut({scope:'local'});}catch{}
 return true;
}
