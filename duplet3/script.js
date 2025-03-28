const { WidgetSDK } = WotstatWidgetsSdk;
const sdk = new WidgetSDK();

// На початку скрипта
if (window.location.search.includes('clearcache=true')) {
  localStorage.clear();
  window.location.href = window.location.pathname;
}

// Зберігаємо дані про гравців
const players = {};
const platoonIds = new Set();

// Дані команди
const teamStats = {
  damage: 0,
  frags: 0,
  victories: 0,
  battles: 0,
  points: 0
};

// Масив для збереження історії боїв
let battleHistory = [];

// Дані для відстеження поточного бою
const currentBattleStats = {
  isActive: false,
  playersInitialDamage: {},
  playersInitialKills: {},
  fragsThisBattle: {},  // Відстеження фрагів для кожного гравця в поточному бою
  map: "", // Зберігання назви мапи
  startTime: null, // Час початку бою
  vehicles: {} // Техніка гравців
};

// Константи
const POINTS_PER_DAMAGE = 1;
const POINTS_PER_FRAG = 400;
const POINTS_PER_TEAM_WIN = 1000; // очок на команду за перемогу

// Ініціалізація даних гравця
function initPlayer(id, name) {
  if (!players[id]) {
    players[id] = {
      id: id,
      name: name || `Player ${id}`,
      damage: 0,
      kills: 0,
      battles: 0
    };
  }
  return players[id];
}

// Розрахунок очок для гравця
function calculatePlayerPoints(player) {
  return player.damage + (player.kills * POINTS_PER_FRAG);
}

// Розрахунок загальних очок команди
function calculateTeamPoints() {
  let basePoints = 0;
  
  // Сума пошкодження та фрагів від усіх гравців
  Array.from(platoonIds).forEach(id => {
    const player = players[id];
    if (!player) return;
    
    basePoints += calculatePlayerPoints(player);
  });
  
  // Додаємо очки за перемоги для всієї команди (1000 за кожну перемогу)
  basePoints += teamStats.victories * POINTS_PER_TEAM_WIN;
  
  return basePoints;
}

// Оновлення командної статистики
function updateTeamStats() {
  teamStats.damage = 0;
  teamStats.frags = 0;
  
  // Підсумовуємо статистику всіх гравців
  Array.from(platoonIds).forEach(id => {
    const player = players[id];
    if (!player) return;
    
    teamStats.damage += player.damage;
    teamStats.frags += player.kills;
  });
  
  // Розрахунок загальних очок команди
  teamStats.points = calculateTeamPoints();
  
  // Оновлюємо елементи UI
  document.getElementById('team-damage').textContent = teamStats.damage.toLocaleString();
  document.getElementById('team-frags').textContent = teamStats.frags.toLocaleString();
  document.getElementById('battles-count').textContent = 
    `${teamStats.victories}/${teamStats.battles}`;
  document.getElementById('team-points').textContent = teamStats.points.toLocaleString();
}

// Оновлення UI гравців
function updatePlayersUI() {
  const container = document.getElementById('player-container');
  container.innerHTML = '';
  
  // Створення рядків для кожного гравця у взводі
  Array.from(platoonIds).forEach(id => {
    const player = players[id];
    if (!player) return;
    
    // Розрахунок очок для гравця (БЕЗ перемог, тільки пошкодження + фраги)
    const playerPoints = calculatePlayerPoints(player);
    
    // Створюємо рядок гравця
    const playerRow = document.createElement('div');
    playerRow.className = 'player-row';
    
    playerRow.innerHTML = `
      <div class="player-name">${player.name.replace(/\s*\[.*?\]/, '')}</div>
      <div class="player-stats">
        <div class="damage">${player.damage.toLocaleString()}</div>
        <div class="frags">${player.kills}</div>
        <div class="points">${playerPoints.toLocaleString()}</div>
      </div>
    `;
    
    container.appendChild(playerRow);
  });
  
  // Оновлюємо командну статистику
  updateTeamStats();
}

// Запам'ятовуємо поточну статистику гравців при вході в бій
function saveInitialBattleStats() {
  currentBattleStats.playersInitialDamage = {};
  currentBattleStats.playersInitialKills = {};
  currentBattleStats.fragsThisBattle = {};
  currentBattleStats.vehicles = {};
  currentBattleStats.startTime = Date.now();
  
  Array.from(platoonIds).forEach(id => {
    const player = players[id];
    if (!player) return;
    
    currentBattleStats.playersInitialDamage[id] = player.damage;
    currentBattleStats.playersInitialKills[id] = player.kills;
    currentBattleStats.fragsThisBattle[id] = 0; // Початок нового бою, 0 фрагів
  });
  
  // Зберігаємо інформацію про мапу
  if (sdk.data.battle.mapName && sdk.data.battle.mapName.value) {
    currentBattleStats.map = sdk.data.battle.mapName.value;
  }
}

// Функція для видалення гравців, які вже не є в взводі
function cleanupPlayers() {
  // Отримуємо список ID гравців, які зараз є у взводі
  const currentPlayers = new Set(platoonIds);
  
  // Перевіряємо кожен запис у словнику players
  Object.keys(players).forEach(id => {
    // Якщо гравця немає в поточному взводі, видаляємо його
    if (!currentPlayers.has(id)) {
      delete players[id];
    }
  });
  
  // Оновлюємо UI
  updatePlayersUI();
  
  // Зберігаємо оновлену статистику
  saveStats();
}

// Отримання даних про взвод
sdk.data.platoon.isInPlatoon.watch((isInPlatoon) => {
  // Додаємо поточного гравця до списку
  const currentPlayerId = sdk.data.player.id.value;
  if (currentPlayerId) {
    platoonIds.add(currentPlayerId);
    initPlayer(currentPlayerId, sdk.data.player.name.value);
  }
  
  // Якщо не у взводі, оновлюємо UI тільки з поточним гравцем
  if (!isInPlatoon) {
    updatePlayersUI();
  }
});

// Відстеження складу взводу
sdk.data.platoon.slots.watch((slots) => {
  if (!slots || !Array.isArray(slots)) return;
  
  // Запам'ятовуємо попередній склад взводу для порівняння
  const previousPlatoonIds = new Set(platoonIds);
  
  // Очищуємо поточний список гравців взводу
  platoonIds.clear();
  
  // Додаємо поточного гравця до списку
  const currentPlayerId = sdk.data.player.id.value;
  if (currentPlayerId) {
    platoonIds.add(currentPlayerId);
    initPlayer(currentPlayerId, sdk.data.player.name.value);
  }
  
  // Додаємо всіх гравців взводу до списку
  slots.forEach(slot => {
    if (slot && slot.dbid) {
      platoonIds.add(slot.dbid);
      initPlayer(slot.dbid, slot.name);
    }
  });
  
  // Перевіряємо, чи змінився склад взводу
  let platoonChanged = false;
  if (previousPlatoonIds.size !== platoonIds.size) {
    platoonChanged = true;
  } else {
    // Перевіряємо, чи всі ID з попереднього списку є в новому
    for (let id of previousPlatoonIds) {
      if (!platoonIds.has(id)) {
        platoonChanged = true;
        break;
      }
    }
  }
  
  // Якщо склад взводу змінився, видаляємо гравців, яких більше немає
  if (platoonChanged) {
    cleanupPlayers();
  }
  
  updatePlayersUI();
});

// Слідкуємо за ім'ям гравця
sdk.data.player.name.watch((name) => {
  const currentPlayerId = sdk.data.player.id.value;
  if (currentPlayerId && players[currentPlayerId]) {
    players[currentPlayerId].name = name;
    updatePlayersUI();
  }
});

// Відстеження техніки гравця
sdk.data.battle.vehicle.name.watch((vehicleName) => {
  if (!currentBattleStats.isActive || !vehicleName) return;
  
  const currentPlayerId = sdk.data.player.id.value;
  if (currentPlayerId) {
    if (!currentBattleStats.vehicles[currentPlayerId]) {
      currentBattleStats.vehicles[currentPlayerId] = {};
    }
    currentBattleStats.vehicles[currentPlayerId].name = vehicleName;
  }
});

// Відстеження назви мапи
sdk.data.battle.mapName.watch((mapName) => {
  if (currentBattleStats.isActive && mapName) {
    currentBattleStats.map = mapName;
  }
});

// Відстеження входу/виходу з бою
sdk.data.battle.isInBattle.watch((inBattle) => {
  if (inBattle && !currentBattleStats.isActive) {
    // Гравець увійшов в бій
    currentBattleStats.isActive = true;
    
    // Збільшуємо лічильник боїв при вході в бій
    teamStats.battles++;
    
    // Зберігаємо початковий стан перед боєм для історії
    const stateBefore = {
      players: JSON.parse(JSON.stringify(players)),
      teamStats: JSON.parse(JSON.stringify(teamStats))
    };
    
    // Додаємо новий запис у історію боїв
    battleHistory.push({
      timestamp: Date.now(),
      stateBefore: stateBefore,
      isComplete: false // Позначаємо, що бій ще не завершений
    });
    
    saveInitialBattleStats();
    
    // Оновлюємо UI, щоб відобразити новий лічильник боїв
    updatePlayersUI();
    
    console.log("Бій розпочався");
  } else if (!inBattle && currentBattleStats.isActive) {
    // Гравець вийшов з бою (але результати ще не отримані)
    currentBattleStats.isActive = false;
    console.log("Бій завершився");
  }
});

// Відстеження шкоди для поточного гравця через efficiency
sdk.data.battle.efficiency.damage.watch((newDamage, oldDamage) => {
  if (!currentBattleStats.isActive) return;
  
  if (newDamage > oldDamage) {
    const currentPlayerId = sdk.data.player.id.value;
    const additionalDamage = newDamage - oldDamage;
    
    // Оновлюємо статистику поточного гравця
    if (currentPlayerId) {
      const player = initPlayer(currentPlayerId, sdk.data.player.name.value);
      player.damage += additionalDamage;
      
      // Оновлюємо UI
      updatePlayersUI();
      
      // Зберігаємо в localStorage
      saveStats();
    }
  }
});

// Спеціальна функція для оновлення фрагів гравця
function updatePlayerKill(playerId, playerName) {
  if (!currentBattleStats.isActive || !playerId) return;
  
  // Отримуємо або створюємо запис гравця
  const player = initPlayer(playerId, playerName);
  
  // Збільшуємо кількість фрагів
  player.kills += 1;
  
  // Відстежуємо фраги в поточному бою
  if (!currentBattleStats.fragsThisBattle[playerId]) {
    currentBattleStats.fragsThisBattle[playerId] = 0;
  }
  currentBattleStats.fragsThisBattle[playerId] += 1;
  
  // Оновлюємо UI
  updatePlayersUI();
  
  // Зберігаємо в localStorage
  saveStats();
}

// Відстеження фрагів через PlayerFeedback
sdk.data.battle.onPlayerFeedback.watch(feedback => {
  if (!currentBattleStats.isActive || !feedback) return;
  
  // VEHICLE_KILL вказує на знищення танка
  if (feedback.type === 'VEHICLE_KILL') {
    const currentPlayerId = sdk.data.player.id.value;
    if (currentPlayerId && platoonIds.has(currentPlayerId)) {
      updatePlayerKill(currentPlayerId, sdk.data.player.name.value);
    }
  }
});

// Обробка результатів бою
sdk.data.battle.onBattleResult.watch(result => {
  if (!result || !result.vehicles || !result.players) {
    console.error("Invalid battle result data");
    return;
  }
  
  // Перевірка на перемогу (лише один раз для всієї команди)
  const currentPlayerId = sdk.data.player.id.value;
  let isVictory = false;
  
  if (result.players[currentPlayerId] && result.common && result.common.winnerTeam) {
    if (parseInt(result.players[currentPlayerId].team) === parseInt(result.common.winnerTeam)) {
      // Додаємо перемогу для всієї команди (а не для кожного гравця окремо)
      teamStats.victories++;
      isVictory = true;
    }
  }
  
  // Обробляємо результати для кожного гравця у взводі
  Array.from(platoonIds).forEach(playerId => {
    // Перевіряємо, чи є дані про гравця
    if (!result.players[playerId]) return;
    
    const playerData = players[playerId];
    if (!playerData) return;
    
    // Фіксуємо бій
    playerData.battles++;
    
    // Для гравців, які НЕ є поточним гравцем (інші члени взводу),
    // оновлюємо статистику з результатів бою
    if (playerId !== currentPlayerId) {
      // Шукаємо техніку гравця і отримуємо статистику
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            playerData.damage += vehicle.damageDealt || 0;
            playerData.kills += vehicle.kills || 0;
            break;
          }
        }
      }
    } else {
      // Для поточного гравця - шкода вже оновлена в реальному часі
      // Перевіряємо фраги - якщо в результатах більше, ніж відстежено в бою, оновлюємо
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            const fragsInBattle = currentBattleStats.fragsThisBattle[playerId] || 0;
            const fragsInResult = vehicle.kills || 0;
            
            // Якщо фрагів в результатах більше, додаємо різницю
            if (fragsInResult > fragsInBattle) {
              playerData.kills += (fragsInResult - fragsInBattle);
            }
            
            break;
          }
        }
      }
    }
  });
  
  // Оновлюємо запис в історії
  if (battleHistory.length > 0) {
    const lastBattleIndex = battleHistory.length - 1;
    const lastBattle = battleHistory[lastBattleIndex];
    
    // Оновлюємо останній запис, якщо він не був завершений
    if (!lastBattle.isComplete) {
      lastBattle.stateAfter = {
        players: JSON.parse(JSON.stringify(players)),
        teamStats: JSON.parse(JSON.stringify(teamStats))
      };
      lastBattle.isComplete = true;
      
      // Додаємо інформацію про бій
      const battleLogId = Date.now().toString();
      lastBattle.battleLogId = battleLogId;
      
      battleHistory[lastBattleIndex] = lastBattle;
      
      // Обмежуємо довжину історії (зберігаємо останні 10 боїв)
      if (battleHistory.length > 10) {
        battleHistory.shift();
      }
      
      // Зберігаємо історію
      localStorage.setItem('wotPlatoonBattleHistory', JSON.stringify(battleHistory));
    }
  }
  
  // Створюємо детальний запис про бій для зовнішнього зберігання
  const battleDetails = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    map: currentBattleStats.map || "Unknown Map",
    victory: isVictory,
    players: {},
    duration: Math.floor((Date.now() - currentBattleStats.startTime) / 1000) || 0
  };
  
  // Додаємо дані кожного гравця з взводу
  Array.from(platoonIds).forEach(playerId => {
    if (!result.players[playerId]) return;
    const playerData = players[playerId];
    if (!playerData) return;
    
    let playerVehicle = "Unknown Vehicle";
    // Знаходимо інформацію про техніку гравця
    for (const vehicleId in result.vehicles) {
      const vehicles = result.vehicles[vehicleId];
      for (const vehicle of vehicles) {
        if (vehicle.accountDBID === playerId) {
          playerVehicle = vehicle.vehicleName || playerVehicle;
          break;
        }
      }
    }
    
    // Розраховуємо шкоду в цьому бою
    let playerDamage = 0;
    if (playerId === currentPlayerId) {
      const initialDamage = currentBattleStats.playersInitialDamage[playerId] || 0;
      playerDamage = playerData.damage - initialDamage;
    } else {
      // Для інших гравців шукаємо шкоду в результатах
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            playerDamage = vehicle.damageDealt || 0;
            break;
          }
        }
      }
    }
    
    // Розраховуємо фраги в цьому бою
    let playerFrags = 0;
    if (playerId === currentPlayerId) {
      playerFrags = currentBattleStats.fragsThisBattle[playerId] || 0;
    } else {
      // Для інших гравців шукаємо фраги в результатах
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            playerFrags = vehicle.kills || 0;
            break;
          }
        }
      }
    }
    
    // Додаємо детальну інформацію про гравця
    battleDetails.players[playerId] = {
      name: playerData.name,
      damage: playerDamage,
      frags: playerFrags,
      vehicle: playerVehicle
    };
  });
  
  // Відправляємо дані бою до зовнішнього сховища
  sendBattleDataToExternalStorage(battleDetails);
  
  updatePlayersUI();
  
  // Зберігаємо дані в localStorage для збереження між оновленнями
  saveStats();
});

// Функція для збереження даних бою через GitHub Issue
function sendBattleDataToExternalStorage(battleData) {
  try {
    // Створюємо заголовок та тіло issue
    const issueTitle = `Add battle data for ${new Date().toISOString().split('T')[0]}`;
    const issueBody = JSON.stringify(battleData, null, 2);
    
    // Створюємо URL для створення issue
    const issueUrl = `https://github.com/juniorapi/testwot/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}&labels=battle-data`;
    
    // Відкриваємо нове вікно для створення issue
    window.open(issueUrl, '_blank');
    
    console.log('Battle data submitted as GitHub issue');
  } catch (e) {
    console.error("Failed to send battle data:", e);
  }
}

// Функція для видалення бою через GitHub Issue
function deleteBattleFromExternalStorage(battleId) {
  try {
    // Створюємо заголовок та тіло issue
    const issueTitle = `Delete battle ${battleId}`;
    const issueBody = `Please delete battle with ID: ${battleId}`;
    
    // Створюємо URL для створення issue
    const issueUrl = `https://github.com/juniorapi/testwot/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}&labels=delete-battle`;
    
    // Відкриваємо нове вікно для створення issue
    window.open(issueUrl, '_blank');
    
    console.log('Delete request submitted as GitHub issue');
    return true;
  } catch (e) {
    console.error("Failed to submit delete request:", e);
    return false;
  }
}

// Функції для збереження і завантаження статистики
function saveStats() {
  localStorage.setItem('wotPlatoonStats', JSON.stringify({
    players: players,
    teamStats: teamStats,
    platoonIds: Array.from(platoonIds)
  }));
}

function loadStats() {
  const saved = localStorage.getItem('wotPlatoonStats');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      
      // Відновлюємо дані гравців
      if (data.players) {
        Object.assign(players, data.players);
      }
      
      // Відновлюємо командну статистику
      if (data.teamStats) {
        Object.assign(teamStats, data.teamStats);
      }
      
      // Відновлюємо ID гравців взводу
      if (data.platoonIds) {
        data.platoonIds.forEach(id => platoonIds.add(id));
      }
      
      // Відновлюємо історію боїв
      const savedHistory = localStorage.getItem('wotPlatoonBattleHistory');
      if (savedHistory) {
        battleHistory = JSON.parse(savedHistory);
      }
      
      updatePlayersUI();
    } catch (e) {
      console.error("Error loading saved stats:", e);
    }
  }
}

// Завантажуємо збережені дані при запуску
loadStats();

// Функція для збереження даних у файл
async function saveStatsToFile() {
  try {
    // Підготуємо дані для збереження
    const statsData = JSON.stringify({
      players: players,
      teamStats: teamStats,
      platoonIds: Array.from(platoonIds),
      battleHistory: battleHistory
    }, null, 2); // Форматування для кращої читабельності
    
    // Створюємо Blob з даними
    const blob = new Blob([statsData], { type: 'application/json' });
    
    // Запасний варіант для всіх браузерів
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wot-platoon-stats.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("Дані успішно збережено у файл");
    return true;
  } catch (e) {
    console.error("Помилка при експорті даних:", e);
    return false;
  }
}

// Функція для завантаження даних з файлу
async function loadStatsFromFile() {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    return new Promise((resolve) => {
      input.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) {
          resolve(false);
          return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result);
            
            // Відновлюємо дані
            if (data.players) {
              Object.assign(players, data.players);
            }
            
            if (data.teamStats) {
              Object.assign(teamStats, data.teamStats);
            }
            
            if (data.platoonIds) {
              platoonIds.clear();
              data.platoonIds.forEach(id => platoonIds.add(id));
            }
            
            if (data.battleHistory) {
              battleHistory = data.battleHistory;
            }
            
            updatePlayersUI();
            saveStats();
            console.log("Дані успішно завантажено з файлу");
            resolve(true);
          } catch (e) {
            console.error("Помилка при розборі файлу:", e);
            resolve(false);
          }
        };
        
        reader.readAsText(file);
      };
      
      input.click();
    });
  } catch (e) {
    console.error("Помилка при імпорті даних:", e);
    return false;
  }
}

// Виправлена функція відкату останнього бою
function undoLastBattle() {
  if (battleHistory.length > 0) {
    const lastBattle = battleHistory.pop();
    
    // Повністю відновлюємо стан до бою
    if (lastBattle.stateBefore) {
      // Відновлюємо статистику команди (включаючи victories та battles)
      // Важливо – привласнюємо повністю весь об'єкт, а не лише окремі властивості
      Object.assign(teamStats, JSON.parse(JSON.stringify(lastBattle.stateBefore.teamStats)));
      
      // Відновлюємо дані гравців
      Object.keys(lastBattle.stateBefore.players).forEach(id => {
        if (players[id]) {
          Object.assign(players[id], JSON.parse(JSON.stringify(lastBattle.stateBefore.players[id])));
        } else {
          players[id] = JSON.parse(JSON.stringify(lastBattle.stateBefore.players[id]));
        }
      });
      
      // Видаляємо відповідний запис у зовнішньому сховищі
      if (lastBattle.battleLogId) {
        deleteBattleFromExternalStorage(lastBattle.battleLogId);
      }
    }
    
    // Оновлюємо історію
    localStorage.setItem('wotPlatoonBattleHistory', JSON.stringify(battleHistory));
    
    // Оновлюємо UI і зберігаємо
    updatePlayersUI();
    saveStats();
    
    console.log("Бій скасовано. Нова статистика:", 
      `${teamStats.victories}/${teamStats.battles}`);
    
    return true;
  }
  return false;
}

// Додаємо кнопку відкоту останнього бою
const undoButton = document.createElement('button');
undoButton.textContent = 'Скасувати останнє';
undoButton.style.position = 'absolute';
undoButton.style.right = '5px';
undoButton.style.bottom = '40px';
undoButton.style.padding = '5px 10px';
undoButton.style.background = 'rgba(30, 144, 255, 0.7)';
undoButton.style.color = 'white';
undoButton.style.border = 'none';
undoButton.style.borderRadius = '4px';
undoButton.style.fontSize = '12px';
undoButton.style.cursor = 'pointer';

// Застосування виправленої функції до обробника кнопки
undoButton.addEventListener('click', () => {
  if (battleHistory.length > 0 && confirm('Відкотити останній бій?')) {
    undoLastBattle();
  } else if (battleHistory.length === 0) {
    alert('Історія боїв порожня');
  }
});

document.body.appendChild(undoButton);

// Додаємо кнопку для перегляду історії боїв
const historyButton = document.createElement('button');
historyButton.textContent = 'Історія боїв';
historyButton.style.position = 'absolute';
historyButton.style.right = '70px';
historyButton.style.bottom = '40px';
historyButton.style.padding = '5px 10px';
historyButton.style.background = 'rgba(128, 0, 128, 0.7)';
historyButton.style.color = 'white';
historyButton.style.border = 'none';
historyButton.style.borderRadius = '4px';
historyButton.style.fontSize = '12px';
historyButton.style.cursor = 'pointer';

historyButton.addEventListener('click', () => {
  window.open('https://juniorapi.github.io/testwot/duplet3/battle-history.html', '_blank');
});

document.body.appendChild(historyButton);

// Додаємо кнопку для перегляду даних
const viewDataButton = document.createElement('button');
viewDataButton.textContent = 'Переглянути дані';
viewDataButton.style.position = 'absolute';
viewDataButton.style.right = '270px';
viewDataButton.style.bottom = '5px';
viewDataButton.style.padding = '5px 10px';
viewDataButton.style.background = 'rgba(75, 75, 200, 0.7)';
viewDataButton.style.color = 'white';
viewDataButton.style.border = 'none';
viewDataButton.style.borderRadius = '4px';
viewDataButton.style.fontSize = '12px';
viewDataButton.style.cursor = 'pointer';

viewDataButton.addEventListener('click', () => {
  // Отримуємо дані
  const stats = JSON.parse(localStorage.getItem('wotPlatoonStats')) || {};
  const history = JSON.parse(localStorage.getItem('wotPlatoonBattleHistory')) || [];
  
  // Створюємо вікно для відображення даних
  const popup = document.createElement('div');
  popup.style.position = 'fixed';
  popup.style.top = '50%';
  popup.style.left = '50%';
  popup.style.transform = 'translate(-50%, -50%)';
  popup.style.width = '80%';
  popup.style.maxHeight = '80%';
  popup.style.overflow = 'auto';
  popup.style.backgroundColor = 'rgba(20, 20, 20, 0.95)';
  popup.style.color = '#fff';
  popup.style.padding = '20px';
  popup.style.borderRadius = '8px';
  popup.style.zIndex = '1000';
  
  // Додаємо вміст
  popup.innerHTML = `
    <h3 style="margin-top:0;">Збережені дані</h3>
    <div>
      <h4>Загальна статистика:</h4>
      <pre style="background:rgba(0,0,0,0.3);padding:10px;overflow:auto;">${JSON.stringify(stats, null, 2)}</pre>
      <h4>Історія боїв (${history.length}):</h4>
      <pre style="background:rgba(0,0,0,0.3);padding:10px;overflow:auto;">${JSON.stringify(history, null, 2)}</pre>
    </div>
    <button id="close-popup" style="margin-top:15px;padding:5px 15px;background:rgba(200,30,30,0.7);border:none;color:white;border-radius:4px;cursor:pointer;">Закрити</button>
  `;
  
  // Додаємо вікно на сторінку
  document.body.appendChild(popup);
  
  // Закриття вікна
  document.getElementById('close-popup').addEventListener('click', () => {
    document.body.removeChild(popup);
  });
});

document.body.appendChild(viewDataButton);

// Додаємо кнопку експорту даних
const exportButton = document.createElement('button');
exportButton.textContent = 'Експорт';
exportButton.style.position = 'absolute';
exportButton.style.right = '140px';
exportButton.style.bottom = '5px';
exportButton.style.padding = '5px 10px';
exportButton.style.background = 'rgba(0, 128, 128, 0.7)';
exportButton.style.color = 'white';
exportButton.style.border = 'none';
exportButton.style.borderRadius = '4px';
exportButton.style.fontSize = '12px';
exportButton.style.cursor = 'pointer';

exportButton.addEventListener('click', saveStatsToFile);
document.body.appendChild(exportButton);

// Додаємо кнопку імпорту даних
const importButton = document.createElement('button');
importButton.textContent = 'Імпорт';
importButton.style.position = 'absolute';
importButton.style.right = '210px';
importButton.style.bottom = '5px';
importButton.style.padding = '5px 10px';
importButton.style.background = 'rgba(128, 0, 128, 0.7)';
importButton.style.color = 'white';
importButton.style.border = 'none';
importButton.style.borderRadius = '4px';
importButton.style.fontSize = '12px';
importButton.style.cursor = 'pointer';

importButton.addEventListener('click', loadStatsFromFile);
document.body.appendChild(importButton);

// Додаємо кнопку скидання
const resetButton = document.createElement('button');
resetButton.textContent = 'Обнулити';
resetButton.style.position = 'absolute';
resetButton.style.right = '5px';
resetButton.style.bottom = '5px';
resetButton.style.padding = '5px 10px';
resetButton.style.background = 'rgba(200, 30, 30, 0.7)';
resetButton.style.color = 'white';
resetButton.style.border = 'none';
resetButton.style.borderRadius = '4px';
resetButton.style.fontSize = '12px';
resetButton.style.cursor = 'pointer';

resetButton.addEventListener('click', () => {
  if (confirm('Обнулити всю статистику?')) {
    // Очищаємо дані
    Object.keys(players).forEach(id => {
      players[id].damage = 0;
      players[id].kills = 0;
      players[id].battles = 0;
    });
    
    teamStats.damage = 0;
    teamStats.frags = 0;
    teamStats.victories = 0;
    teamStats.battles = 0;
    teamStats.points = 0;
    
    // Очищаємо дані поточного бою
    currentBattleStats.playersInitialDamage = {};
    currentBattleStats.playersInitialKills = {};
    currentBattleStats.fragsThisBattle = {};
    
    // Очищаємо історію боїв
    battleHistory = [];
    localStorage.removeItem('wotPlatoonBattleHistory');
    
    // Оновлюємо інтерфейс і зберігаємо зміни
    updatePlayersUI();
    saveStats();
    
    // Створюємо issue для очищення даних на GitHub
    const issueTitle = `Clear all battle data`;
    const issueBody = `Please clear all battle data. This is a reset request.`;
    const issueUrl = `https://github.com/juniorapi/testwot/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}&labels=clear-data`;
    window.open(issueUrl, '_blank');
  }
});

document.body.appendChild(resetButton);

// Перевіряємо, чи потрібно видалити бій (при переході з історії боїв)
if (window.location.search.includes('deleteBattle=')) {
  const urlParams = new URLSearchParams(window.location.search);
  const battleId = urlParams.get('deleteBattle');
  
  if (battleId) {
    if (confirm(`Видалити бій ${battleId}?`)) {
      deleteBattleFromExternalStorage(battleId);
      // Оновлюємо URL без параметрів
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}
