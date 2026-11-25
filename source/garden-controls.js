export function installWeather(setRain) {
  const choices = [...document.querySelectorAll('[data-weather]')];
  for (const choice of choices) {
    choice.addEventListener('click', () => {
      if (choice.getAttribute('aria-pressed') === 'true') return;
      setRain(choice.dataset.weather === 'rain');
      for (const item of choices) item.setAttribute('aria-pressed', String(item === choice));
    });
  }
}
