pub const KEYBOARD: &str = r#"
(() => {
  if (window.__url2appKeys) return;
  window.__url2appKeys = true;
  addEventListener("keydown", (event) => {
    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      history.back();
    } else if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      history.forward();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
      event.preventDefault();
      location.reload();
    }
  });
})();
"#;
