@import url("https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Noto+Sans+TC:wght@400;500;600;700&display=swap");
@import "tailwindcss";

:root {
  --paper: #f6eadf;
  --panel: #fff7ef;
  --paper-strong: #f2e3d2;
  --ink: #241b16;
  --muted: #7e6b60;
  --accent: #cb5c33;
  --accent-strong: #b24c26;
  --accent-soft: #f6ddcf;
  --line: rgba(99, 67, 46, 0.14);
  --font-display: "DM Serif Display", serif;
  --font-body: "Noto Sans TC", sans-serif;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  font-family: var(--font-body);
  color: var(--ink);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.75), transparent 32%),
    radial-gradient(circle at right center, rgba(92, 150, 138, 0.16), transparent 24%),
    radial-gradient(circle at bottom right, rgba(226, 168, 137, 0.22), transparent 24%),
    linear-gradient(180deg, #fffaf4 0%, #f6eadf 100%);
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(rgba(120, 84, 54, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120, 84, 54, 0.05) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.28), transparent 88%);
}

* {
  box-sizing: border-box;
}

::selection {
  background: rgba(203, 92, 51, 0.18);
}

#root {
  min-height: 100vh;
}

button,
input,
select,
textarea {
  font: inherit;
}
