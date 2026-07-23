document.documentElement.classList.add("js");

for (const button of document.querySelectorAll(".copy-button")) {
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.dataset.copyTarget);
    const status = button.closest(".command-cta")?.querySelector(".copy-status");
    const command = target?.textContent?.trim();

    if (!command || !status) return;

    try {
      await navigator.clipboard.writeText(command);
      const originalLabel = button.textContent;
      button.textContent = button.dataset.copySuccess;
      status.textContent = button.dataset.copySuccess;
      window.setTimeout(() => {
        button.textContent = originalLabel;
        status.textContent = "";
      }, 2200);
    } catch {
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
      status.textContent = button.dataset.copyFallback;
    }
  });
}
