// Edge Add-ons API v1.1：上传草稿包 → 等待处理 → 提交发布。
// 需要环境变量 EDGE_PRODUCT_ID / EDGE_CLIENT_ID / EDGE_API_KEY。
//
// 上一版还在审核时，Edge 会以 InProgressSubmission 拒绝提交。这种情况不算失败：
// 脚本以 0 退出，并在 $GITHUB_OUTPUT 写入 status=pending，由工作流打上 edge-pending
// 标记，edge-retry.yml 定时补交最新 Release。成功提交时写 status=submitted。
import { readFile, appendFile } from 'node:fs/promises';

const { EDGE_PRODUCT_ID: pid, EDGE_CLIENT_ID: cid, EDGE_API_KEY: key } = process.env;
const zip = process.argv[2] || 'margin.zip';
const version = process.argv[3] || process.env.GITHUB_REF_NAME || '';
const base = `https://api.addons.microsoftedge.microsoft.com/v1/products/${pid}/submissions`;
const auth = { Authorization: `ApiKey ${key}`, 'X-ClientID': cid };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class InProgress extends Error {}

async function output(status) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `status=${status}\n`);
}

async function poll(url, label) {
  for (let i = 0; i < 40; i++) {
    await sleep(5000);
    const r = await fetch(url, { headers: auth });
    const j = await r.json().catch(() => ({}));
    if (j.status === 'Succeeded') return j;
    if (j.status === 'Failed') {
      if (j.errorCode === 'InProgressSubmission') throw new InProgress(j.message || label);
      throw new Error(`${label} failed: ${JSON.stringify(j)}`);
    }
  }
  throw new Error(`${label} timed out`);
}

try {
  const up = await fetch(`${base}/draft/package`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/zip' },
    body: await readFile(zip),
  });
  if (up.status !== 202) throw new Error(`upload ${up.status}: ${await up.text()}`);
  await poll(`${base}/draft/package/operations/${up.headers.get('location')}`, 'upload');
  console.log(`package ${version} uploaded`);

  const pub = await fetch(base, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: `Release ${version}`.trim() }),
  });
  if (pub.status !== 202) throw new Error(`publish ${pub.status}: ${await pub.text()}`);
  await poll(`${base}/operations/${pub.headers.get('location')}`, 'publish');
  console.log(`${version} submitted for review`);
  await output('submitted');
} catch (e) {
  if (!(e instanceof InProgress)) throw e;
  console.log(`::warning title=Edge 发布延后::上一版仍在 Edge 审核中，${version} 已排队，审核结束后由 edge-retry 自动补交（${e.message}）`);
  await output('pending');
}
