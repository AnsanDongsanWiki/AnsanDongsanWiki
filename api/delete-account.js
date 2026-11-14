import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
};

const must = result => {
  if (result.error) throw result.error;
  return result.data;
};

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createWithdrawalHandler({
  clientFactory = createClient,
  env = process.env
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({
        error: 'POST 요청만 허용됩니다.'
      });
    }

    try {
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      ) {
        throw new RequestError(
          403,
          '이 사이트에서 다시 시도해 주세요.'
        );
      }

      const token = /^Bearer\s+(.+)$/i.exec(
        req.headers.authorization || ''
      )?.[1];

      if (!token || token.length > 12000) {
        throw new RequestError(401, '다시 로그인해 주세요.');
      }

      let body = req.body;

      if (typeof body === 'string') {
        if (Buffer.byteLength(body) > 4096) {
          throw new RequestError(400, '요청 내용이 너무 깁니다.');
        }

        try {
          body = JSON.parse(body);
        } catch {
          throw new RequestError(400, '잘못된 요청입니다.');
        }
      }

      if (
        !body ||
        body.confirmation !== '회원탈퇴' ||
        typeof body.password !== 'string' ||
        !body.password ||
        body.password.length > 128
      ) {
        throw new RequestError(
          400,
          '현재 비밀번호와 회원탈퇴 확인 문구를 입력해 주세요.'
        );
      }

      const url =
        env.SUPABASE_URL ||
        env.VITE_SUPABASE_URL;

      const publicKey =
        env.SUPABASE_PUBLISHABLE_KEY ||
        env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const secret =
        env.SUPABASE_SECRET_KEY ||
        env.SUPABASE_SERVICE_ROLE_KEY;

      if (!url || !publicKey || !secret) {
        throw new RequestError(
          503,
          '회원탈퇴 서버 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.'
        );
      }

      const authClient = clientFactory(
        url,
        publicKey,
        clientOptions
      );

      const verified = await authClient.auth.getUser(token);
      const user = verified.data?.user;

      if (verified.error || !user?.id || !user.email) {
        throw new RequestError(
          401,
          '로그인 계정을 확인하지 못했습니다. 다시 로그인해 주세요.'
        );
      }

      const signed = await authClient.auth.signInWithPassword({
        email: user.email,
        password: body.password
      });

      if (signed.error || signed.data?.user?.id !== user.id) {
        throw new RequestError(
          401,
          '현재 비밀번호를 확인해 주세요.'
        );
      }

      // 삭제 대상은 인증된 본인 계정으로만 결정합니다.
      const admin = clientFactory(url, secret, clientOptions);
      let manifest;

      try {
        manifest = must(
          await admin.rpc('prepare_wiki_withdrawal', {
            p_user_id: user.id
          })
        );
      } catch (error) {
        if (/마지막 관리자|버킷 소유권/.test(error?.message || '')) {
          throw new RequestError(409, error.message);
        }
        throw error;
      }

      for (const asset of manifest.preserve || []) {
        if (!asset.needs_copy) continue;

        const digest = createHash('sha256')
          .update(asset.name)
          .digest('hex')
          .slice(0, 24);

        const ext =
          /\.([a-z0-9]{1,8})$/i
            .exec(asset.name)?.[1]?.toLowerCase() || 'bin';

        const destination =
          `withdrawn/${asset.id}/${digest}.${ext}`;

        const storage = admin.storage.from(asset.bucket_id);

        const copied = await storage.copy(
          asset.name,
          destination
        );

        if (
          copied.error &&
          ![409, '409'].includes(copied.error.statusCode) &&
          !/already exists|duplicate/i.test(
            copied.error.message || ''
          )
        ) {
          throw copied.error;
        }

        must(
          await admin.rpc('detach_wiki_withdrawal_file', {
            p_user_id: user.id,
            p_id: asset.id,
            p_old_path: asset.name,
            p_new_path: destination
          })
        );
      }

      manifest = must(
        await admin.rpc('prepare_wiki_withdrawal', {
          p_user_id: user.id
        })
      );

      const buckets = new Map();

      for (const file of manifest.remove || []) {
        if (!buckets.has(file.bucket_id)) {
          buckets.set(file.bucket_id, new Set());
        }
        buckets.get(file.bucket_id).add(file.name);
      }

      for (const [bucket, paths] of buckets) {
        const names = [...paths];

        for (let i = 0; i < names.length; i += 100) {
          must(
            await admin.storage
              .from(bucket)
              .remove(names.slice(i, i + 100))
          );
        }
      }

      // Auth 삭제와 함께 SQL 트리거가 회원 정보를 정리합니다.
      must(await admin.auth.admin.deleteUser(user.id, false));

      return res.status(200).json({deleted: true});
    } catch (error) {
      const status =
        error instanceof RequestError ? error.status : 503;

      return res.status(status).json({
        error: error instanceof RequestError
          ? error.message
          : '탈퇴 처리가 완료되지 않았습니다. 파일을 정리하던 중이라면 글쓰기가 잠시 제한될 수 있습니다. 같은 계정으로 회원탈퇴를 다시 시도해 주세요.'
      });
    }
  };
}

export default createWithdrawalHandler();
