// Функція для збереження даних бою в GitHub репозиторій
async function sendBattleDataToExternalStorage(battleData) {
  try {
    // Поточна дата для назви файлу
    const date = new Date().toISOString().split('T')[0];
    const filename = `battles-${date}.json`;
    
    // Спершу спробуємо отримати існуючий файл, якщо він є
    let fileContent = [];
    let sha = '';
    
    try {
      const responseGet = await fetch(`https://api.github.com/repos/juniorapi/testwot/contents/data/${filename}`, {
        headers: {
          'Authorization': 'token YOUR_GITHUB_TOKEN',
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (responseGet.ok) {
        const fileData = await responseGet.json();
        fileContent = JSON.parse(atob(fileData.content));
        sha = fileData.sha;
      }
    } catch (e) {
      console.log("File doesn't exist yet or couldn't be fetched");
    }
    
    // Додаємо новий бій
    fileContent.push(battleData);
    
    // Зберігаємо оновлений файл
    const response = await fetch(`https://api.github.com/repos/juniorapi/testwot/contents/data/${filename}`, {
      method: 'PUT',
      headers: {
        'Authorization': 'token YOUR_GITHUB_TOKEN',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Add battle data for ${date}`,
        content: btoa(JSON.stringify(fileContent, null, 2)),
        sha: sha || undefined
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save data: ${response.statusText}`);
    }
    
    console.log('Battle data saved successfully');
  } catch (e) {
    console.error("Failed to send battle data:", e);
  }
}

// Функція для отримання даних боїв з GitHub репозиторію
async function fetchBattleDataFromExternalStorage() {
  try {
    // Отримуємо список файлів у папці data
    const response = await fetch('https://api.github.com/repos/juniorapi/testwot/contents/data', {
      headers: {
        'Authorization': 'token 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',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch file list: ${response.statusText}`);
    }
    
    const files = await response.json();
    let allBattles = [];
    
    // Отримуємо вміст кожного файлу
    for (const file of files) {
      if (file.name.startsWith('battles-') && file.name.endsWith('.json')) {
        const fileResponse = await fetch(file.download_url);
        if (fileResponse.ok) {
          const battles = await fileResponse.json();
          allBattles = allBattles.concat(battles);
        }
      }
    }
    
    return allBattles;
  } catch (e) {
    console.error("Failed to fetch battle data:", e);
    return [];
  }
}
