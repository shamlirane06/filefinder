import { Theme } from './settings/types';
import { FileFinderAIDesktopWorkspace } from './components/generated/FileFinderAIDesktopWorkspace';

let theme: Theme = 'light';

function App() {
  function setTheme(theme: Theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  setTheme(theme);

  return (
    <>
      <FileFinderAIDesktopWorkspace />
    </>
  ); // %EXPORT_STATEMENT%
}

export default App;
