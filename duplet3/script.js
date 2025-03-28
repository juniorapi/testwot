const { WidgetSDK } = WotstatWidgetsSdk;
const sdk = new WidgetSDK();

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

// Дані для відстеження поточного бою
const currentBattleStats = {
  isActive: false,
  playersInitialDamage: {},
  playersInitialKills: {},
  fragsThisBattle: {},
  map: "",
  startTime: null,
  vehicles: {}
};

// Константи
const POINTS_PER_DAMAGE = 1;
const POINTS_PER_FRAG = 400;
const POINTS_PER_TEAM_WIN = 1000;

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
  } else if (name && players[id].name !== name) {
    // Оновлюємо ім'я, якщо воно змінилося
    players[id].name = name;
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
  
  // Додаємо очки за перемоги для всієї команди
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
    
    // Розрахунок очок для гравця
    const playerPoints = calculatePlayerPoints(player);
    
    // Створюємо рядок гравця
    const playerRow = document.createElement('div');
    playerRow.className = 'player-row';
    
    playerRow.innerHTML = `
      <div class="player-name">${player.name.replace(/\s*\[.*?\]/, '')}</div>
      <div class="player-stats">
        <div class="stat-column">
          <div class="stat-head">ШКОДА</div>
          <div class="damage">${player.damage.toLocaleString()}</div>
        </div>
        <div class="stat-column">
          <div class="stat-head">ФРАГИ</div>
          <div class="frags">${player.kills}</div>
        </div>
        <div class="stat-column">
          <div class="stat-head">ОЧКИ</div>
          <div class="points">${playerPoints.toLocaleString()}</div>
        </div>
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
    currentBattleStats.fragsThisBattle[id] = 0;
  });
  
  // Зберігаємо інформацію про мапу
  if (sdk.data.battle.mapName && sdk.data.battle.mapName.value) {
    currentBattleStats.map = sdk.data.battle.mapName.value;
  }
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
    // Видаляємо всіх інших гравців крім поточного
    platoonIds.forEach(id => {
      if (id !== currentPlayerId) {
        platoonIds.delete(id);
      }
    });
    updatePlayersUI();
  }
});

// Відстеження складу взводу
sdk.data.platoon.slots.watch((slots) => {
  if (!slots || !Array.isArray(slots)) return;
  
  // Додаємо всіх гравців взводу до списку
  slots.forEach(slot => {
    if (slot && slot.dbid) {
      platoonIds.add(slot.dbid);
      initPlayer(slot.dbid, slot.name);
    }
  });
  
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
    
    // Повторне оновлення складу взводу при вході в бій
    const slots = sdk.data.platoon.slots.value;
    if (slots && Array.isArray(slots)) {
      slots.forEach(slot => {
        if (slot && slot.dbid) {
          platoonIds.add(slot.dbid);
          initPlayer(slot.dbid, slot.name);
        }
      });
    }
    
    saveInitialBattleStats();
    
    // Оновлюємо UI, щоб відобразити новий лічильник боїв
    updatePlayersUI();
  } else if (!inBattle && currentBattleStats.isActive) {
    // Гравець вийшов з бою (але результати ще не отримані)
    currentBattleStats.isActive = false;
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
    }
  }
});

// ВИПРАВЛЕННЯ: Відстеження загальної шкоди (включно з блайндшотом)
sdk.data.battle.personal.damageDealt.watch((newDamage, oldDamage) => {
  if (!currentBattleStats.isActive) return;
  
  const currentPlayerId = sdk.data.player.id.value;
  if (!currentPlayerId) return;
  
  // Отримуємо початкове значення шкоди для цього бою
  const initialDamage = currentBattleStats.playersInitialDamage[currentPlayerId] || 0;
  
  // Отримуємо поточне значення шкоди гравця
  const player = players[currentPlayerId];
  if (!player) return;
  
  // Обчислюємо правильну шкоду для відображення
  if (newDamage !== undefined && newDamage > 0) {
    // Оновлюємо шкоду гравця на основі загальної шкоди з поля damageDealt
    const currentTotalDamage = initialDamage + newDamage;
    
    // Оновлюємо тільки якщо нове значення більше поточного
    if (currentTotalDamage > player.damage) {
      player.damage = currentTotalDamage;
      
      // Оновлюємо UI
      updatePlayersUI();
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

// Функція для створення запису бою для історії
function createBattleRecord(result, isVictory) {
  const currentPlayerId = sdk.data.player.id.value;
  if (!currentPlayerId) return null;
  
  // Створюємо базовий об'єкт бою
  const battleData = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    map: currentBattleStats.map || "Невідома мапа",
    victory: isVictory,
    duration: Math.floor((Date.now() - currentBattleStats.startTime) / 1000) || 0,
    players: {}
  };
  
  // Додаємо інформацію про всіх гравців взводу
  Array.from(platoonIds).forEach(playerId => {
    if (!result.players[playerId]) return;
    
    const playerData = players[playerId];
    if (!playerData) return;
    
    let vehicleName = "Невідома техніка";
    let damageDealt = 0;
    let frags = 0;
    
    // Шукаємо техніку гравця і отримуємо статистику
    for (const vehicleId in result.vehicles) {
      const vehicles = result.vehicles[vehicleId];
      
      for (const vehicle of vehicles) {
        if (vehicle.accountDBID === playerId) {
          vehicleName = vehicle.vehicleName || vehicleName;
          damageDealt = vehicle.damageDealt || 0;
          frags = vehicle.kills || 0;
          break;
        }
      }
    }
    
    // Для поточного гравця використовуємо відстежену шкоду
    if (playerId === currentPlayerId) {
      const initialDamage = currentBattleStats.playersInitialDamage[playerId] || 0;
      const finalDamage = playerData.damage;
      
      // Рахуємо шкоду, нанесену протягом цього бою
      const battleDamage = finalDamage - initialDamage;
      
      // Використовуємо більше значення: відстежене або з результатів
      damageDealt = Math.max(damageDealt, battleDamage);
      
      // Для фрагів також беремо максимальне значення
      frags = Math.max(frags, currentBattleStats.fragsThisBattle[playerId] || 0);
    }
    
    // Додаємо гравця до запису бою
    battleData.players[playerId] = {
      name: playerData.name,
      damage: damageDealt,
      frags: frags,
      vehicle: vehicleName
    };
  });
  
  return battleData;
}

// Функція для збереження даних бою в історію
function saveBattleToHistory(battleData) {
  // Зберігаємо дані в localStorage для наступного відкриття сторінки історії
  try {
    // Отримуємо існуючу історію або створюємо нову
    let battleHistory = [];
    const savedHistory = localStorage.getItem('wotBattleHistory');
    
    if (savedHistory) {
      battleHistory = JSON.parse(savedHistory);
    }
    
    // Додаємо новий бій
    battleHistory.push(battleData);
    
    // Зберігаємо не більше 100 останніх боїв
    if (battleHistory.length > 100) {
      battleHistory = battleHistory.slice(-100);
    }
    
    // Зберігаємо в localStorage
    localStorage.setItem('wotBattleHistory', JSON.stringify(battleHistory));
    console.log("Бій збережено в історію", battleData);
    
    // Додаємо повідомлення про збереження
    showSaveNotification();
    
    // Намагаємося відправити дані через GitHub Issue (для постійного зберігання)
    sendBattleDataToGitHub(battleData);
    
    return true;
  } catch (e) {
    console.error("Помилка при збереженні історії:", e);
    return false;
  }
}

// Функція для створення повідомлення про збереження бою
function showSaveNotification() {
  const notification = document.createElement('div');
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.backgroundColor = 'rgba(46, 204, 113, 0.9)';
  notification.style.color = 'white';
  notification.style.padding = '10px 15px';
  notification.style.borderRadius = '4px';
  notification.style.fontWeight = '500';
  notification.style.zIndex = '9999';
  notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
  notification.textContent = 'Бій збережено в історію';
  
  document.body.appendChild(notification);
  
  // Видаляємо повідомлення через 3 секунди
  setTimeout(() => {
    document.body.removeChild(notification);
  }, 3000);
}

// Функція для збереження даних бою через GitHub Issue
function sendBattleDataToGitHub(battleData) {
  try {
    // Створюємо заголовок та тіло issue
    const issueTitle = `Add battle data for ${new Date().toISOString().split('T')[0]}`;
    const issueBody = JSON.stringify(battleData, null, 2);
    
    // Створюємо URL для створення issue
    const issueUrl = `https://github.com/juniorapi/testwot/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}&labels=battle-data`;
    
    // Відкриваємо нове вікно для створення issue
    const newWindow = window.open(issueUrl, '_blank');
    
    // Якщо вікно не відкрилося, показуємо повідомлення
    if (!newWindow) {
      console.log("Не вдалося відкрити вікно для GitHub Issue");
      alert("Клацніть 'OK', щоб перейти на GitHub і зберегти результати бою. Це допоможе зберегти вашу статистику назавжди.");
      window.open(issueUrl, '_blank');
    }
    
    console.log('Дані бою відправлено на GitHub');
    return true;
  } catch (e) {
    console.error("Помилка при відправці даних на GitHub:", e);
    return false;
  }
}

// Додаємо кнопку для перегляду історії
function addHistoryButton() {
  const card = document.querySelector('.card');
  if (!card) return;
  
  const buttonContainer = document.createElement('div');
  buttonContainer.style.textAlign = 'center';
  buttonContainer.style.marginTop = '10px';
  
  const historyButton = document.createElement('button');
  historyButton.textContent = "Переглянути історію";
  historyButton.style.padding = '8px 16px';
  historyButton.style.backgroundColor = '#4e54c8';
  historyButton.style.color = 'white';
  historyButton.style.border = 'none';
  historyButton.style.borderRadius = '4px';
  historyButton.style.cursor = 'pointer';
  historyButton.style.fontSize = '14px';
  historyButton.style.fontWeight = '500';
  
  historyButton.addEventListener('click', () => {
    window.open('./battle-history.html', '_blank');
  });
  
  buttonContainer.appendChild(historyButton);
  card.appendChild(buttonContainer);
}

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
      // Додаємо перемогу для всієї команди
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
      // Для поточного гравця - перевіряємо значення з результатів бою
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            // ВИПРАВЛЕННЯ: Враховуємо загальну шкоду з результатів бою
            const damageInResult = vehicle.damageDealt || 0;
            const initialDamage = currentBattleStats.playersInitialDamage[playerId] || 0;
            const currentDamage = playerData.damage;
            
            // Якщо шкода з результатів більша, оновлюємо значення
            const expectedDamage = initialDamage + damageInResult;
            if (expectedDamage > currentDamage) {
              playerData.damage = expectedDamage;
            }
            
            // Також перевіряємо фраги
            const fragsInBattle = currentBattleStats.fragsThisBattle[playerId] || 0;
            const fragsInResult = vehicle.kills || 0;
            
            if (fragsInResult > fragsInBattle) {
              playerData.kills += (fragsInResult - fragsInBattle);
            }
            
            break;
          }
        }
      }
    }
  });
  
  // Створюємо і зберігаємо запис бою в історію
  const battleRecord = createBattleRecord(result, isVictory);
  if (battleRecord) {
    saveBattleToHistory(battleRecord);
  }
  
  updatePlayersUI();
});

// Додаємо кнопку оновлення для примусового оновлення взводу
function addRefreshButton() {
  const container = document.querySelector('.card');
  if (!container) return;
  
  const refreshButton = document.createElement('button');
  refreshButton.textContent = "Оновити взвод";
  refreshButton.style.marginTop = "10px";
  refreshButton.style.padding = "5px 10px";
  refreshButton.style.backgroundColor = "#4e54c8";
  refreshButton.style.color = "white";
  refreshButton.style.border = "none";
  refreshButton.style.borderRadius = "4px";
  refreshButton.style.cursor = "pointer";
  refreshButton.style.marginRight = "10px";
  
  refreshButton.addEventListener('click', () => {
    // Оновлюємо склад взводу при натисканні кнопки
    const slots = sdk.data.platoon.slots.value;
    if (slots && Array.isArray(slots)) {
      slots.forEach(slot => {
        if (slot && slot.dbid) {
          platoonIds.add(slot.dbid);
          initPlayer(slot.dbid, slot.name);
        }
      });
    }
    
    updatePlayersUI();
  });
  
  // Створюємо контейнер для кнопок
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = "flex";
  buttonContainer.style.justifyContent = "center";
  buttonContainer.style.gap = "10px";
  
  buttonContainer.appendChild(refreshButton);
  container.appendChild(buttonContainer);
}

// Ініціалізація віджета
function initializeWidget() {
  // Додаємо кнопку оновлення взводу
  addRefreshButton();
  
  // Додаємо кнопку перегляду історії
  addHistoryButton();
  
  // Виконуємо початкове оновлення UI
  updatePlayersUI();
}

// Запуск віджета з невеликою затримкою для гарантії завантаження даних SDK
setTimeout(initializeWidget, 1000);
