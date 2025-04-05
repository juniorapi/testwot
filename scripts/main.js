import CoreService from './coreService.js';
import UIService from './uiService.js';

export default class SquadWidget {
  constructor() {
    if (!this.checkAccessKey()) {
      this.showAccessDenied();
      return;
    }

    this.initializeServices();
  }

  initializeServices() {
    try {
      this.coreService = new CoreService();
      this.uiService = new UIService(this.coreService);
      this.initialize();
    } catch (error) {
      console.error('Error initializing services:', error);
    }
  }

  initialize() {
    try {
      this.coreService.loadFromServer();
      this.uiService.updatePlayersUI();
    } catch (error) {
      console.error('Error in initialize:', error);
    }
  }

  checkAccessKey() {
    try {
      // Отримуємо параметр з URL (все що після ?)
      const urlParams = window.location.search.substring(1);
      const VALID_KEYS = ['squad1', 'squad2', 'squad3', 'squad4', 'squad5', 'squad6', 'jtv'];


      localStorage.removeItem('accessKey');
      localStorage.setItem('accessKey', urlParams);

      if (VALID_KEYS.includes(urlParams)) {
        return true;
      }

      console.log('No valid key found, access denied');
      return false;
    } catch (error) {
      console.error('Error in checkAccessKey:', error);
      return false;
    }
  }

  showAccessDenied() {
    try {
      const container = document.createElement('div');
      container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: var(--wotstat-background,rgba(255, 255, 255, 0));
        z-index: 9999;
      `;

      const message = document.createElement('div');
      message.style.cssText = `
        text-align: center;
        padding: 2em;
        border-radius: 1em;
        background-color: rgba(0, 0, 0, 0.7);
        color: var(--wotstat-primary, #ffffff);
      `;

      message.innerHTML = `
        <h2>Доступ заборонено</h2>
        <p>Невірний ключ доступу</p>
      `;

      container.appendChild(message);

      document.body.innerHTML = '';
      document.body.appendChild(container);
    } catch (error) {
      console.error('Error in showAccessDenied:', error);
    }
  }
}
