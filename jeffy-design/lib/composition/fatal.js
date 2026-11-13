// 致命错误页：缺字体、主题配置错误这类问题只写一行小字等于没报。
// 这里把错误码、原话和修复命令画在画布正中，人打开 HTML 就能看见，脚本也能立刻识别。
window.renderFatal = function (error) {
  const code = error.code || 'RUNTIME';
  window.renderComplete = true;
  window.renderFailed = true;
  window.validationReport = [{ ok: false, issues: [{ code, message: error.message, hint: error.hint }] }];
  const main = document.querySelector('main');
  if (!main) return;
  main.textContent = '';
  const box = document.createElement('div');
  box.dataset.fatal = code;
  box.style.cssText =
    'max-width:920px;margin:40px auto;padding:36px 44px 40px;background:#fff;border:2px solid #002FA7;color:#1A1A1A;font-family:"Noto Serif SC",Georgia,serif';
  const title = document.createElement('div');
  title.textContent = code + ' · 页面无法生成';
  title.style.cssText = 'font-size:34px;font-weight:600;letter-spacing:-.5px';
  const message = document.createElement('div');
  message.textContent = error.message || '';
  message.style.cssText = 'font-size:20px;line-height:1.7;margin-top:16px';
  box.append(title, message);
  if (error.hint) {
    const hint = document.createElement('pre');
    hint.textContent = error.hint;
    hint.style.cssText = 'margin:22px 0 0;padding:14px 16px;background:#EEF2FB;font-size:16px;white-space:pre-wrap';
    box.append(hint);
  }
  main.append(box);
};
