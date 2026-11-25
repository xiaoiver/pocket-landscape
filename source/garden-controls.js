export function installWeather(setLighting) {
  const choices = [...document.querySelectorAll('[data-weather]')];
  for (const choice of choices) {
    choice.addEventListener('click', () => {
      if (choice.getAttribute('aria-pressed') === 'true') return;
      setLighting(choice.dataset.weather);
      for (const item of choices) item.setAttribute('aria-pressed', String(item === choice));
    });
  }
}
