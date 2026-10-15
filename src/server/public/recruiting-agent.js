const form = document.querySelector('#reply-form');
const status = document.querySelector('#reply-status');
const output = document.querySelector('#reply-output');
form?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  output.textContent = '';
  status.textContent = '正在使用本机 Claude 生成回复草稿…';
  try {
    const values = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/agent/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '回复草稿生成失败。');
    output.textContent = result.text;
    status.textContent = '草稿已生成，请审阅。尚未发送任何消息。';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
