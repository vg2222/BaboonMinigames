document.addEventListener('DOMContentLoaded', () => {
  // --- Константы и глобальные переменные ---
  const API_BASE_URL = '/api'; // Относительный путь для работы на Render
  let currentEmail = '';
  let newPassword = '';

  // --- DOM Элементы ---
  const authContainer = document.getElementById('auth-container');
  const adminPanelContainer = document.getElementById('admin-panel-container');
  const steps = {
      email: document.getElementById('email-step'),
      login: document.getElementById('login-step'),
      register1: document.getElementById('register-step-1'),
      register2: document.getElementById('register-step-2'),
  };
  const inputs = {
      email: document.getElementById('email-input'),
      loginPass: document.getElementById('login-password-input'),
      regPass1: document.getElementById('register-password-input'),
      regPass2: document.getElementById('confirm-password-input'),
      file: document.getElementById('file-input'),
  };
  const buttons = {
      checkEmail: document.getElementById('check-email-btn'),
      login: document.getElementById('login-btn'),
      setPassword: document.getElementById('set-password-btn'),
      confirmPassword: document.getElementById('confirm-password-btn'),
      logout: document.getElementById('logout-btn'),
      upload: document.getElementById('upload-btn'),
  };
  const errors = {
      email: document.getElementById('email-error'),
      login: document.getElementById('login-error'),
      register: document.getElementById('register-error'),
      confirm: document.getElementById('confirm-error'),
  };
  const passwordRules = {
      length: document.getElementById('rule-length'),
      case: document.getElementById('rule-case'),
      digit: document.getElementById('rule-digit'),
      special: document.getElementById('rule-special'),
  };
  const fileList = document.getElementById('file-list');
  const uploadStatus = document.getElementById('upload-status');
  const sidebarNavItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const pages = document.querySelectorAll('.main-content .page');
  const uploadSection = document.querySelector('.upload-section');

  // --- Вспомогательные функции ---
  const formatBytes = (bytes, decimals = 2) => {
      if (!+bytes) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const formatDate = (isoString) => {
      const date = new Date(isoString);
      return date.toLocaleString('ru-RU', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
      });
  };

  // --- Управление UI ---
  const showStep = (stepName) => {
      Object.values(steps).forEach(step => step.classList.remove('active'));
      const nextStep = document.getElementById(`${stepName}-step`);
      if (nextStep) nextStep.classList.add('active');
  };

  const showAdminPanel = (show) => {
      if (show) {
          authContainer.classList.remove('active');
          adminPanelContainer.classList.add('active');
          loadFiles();
      } else {
          authContainer.classList.add('active');
          adminPanelContainer.classList.remove('active');
          showStep('email');
      }
  };
  
  // --- Управление Cookie ---
  const setCookie = (name, value, hours) => {
      let expires = "";
      if (hours) {
          const date = new Date();
          date.setTime(date.getTime() + (hours * 60 * 60 * 1000));
          expires = "; expires=" + date.toUTCString();
      }
      // ИСПРАВЛЕНО: Убран флаг 'Secure' для работы на http://localhost
      document.cookie = `${name}=${value || ""}${expires}; path=/; SameSite=Lax`;
  };

  const getCookie = (name) => {
      const nameEQ = name + "=";
      const ca = document.cookie.split(';');
      for(let c of ca) {
          c = c.trim();
          if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
      }
      return null;
  };
  
  const eraseCookie = (name) => { document.cookie = `${name}=; Max-Age=-99999999; path=/;`; }

  // --- API Запросы ---
  const apiRequest = async (endpoint, method = 'GET', body = null) => {
      const headers = {};
      const token = getCookie('authToken');
      if (token) {
          headers['Authorization'] = `Bearer ${token}`;
      }

      const options = {
          method,
          headers,
      };

      // ИСПРАВЛЕНО: Добавляем тело только для запросов, которые это поддерживают (не GET/HEAD)
      if (method !== 'GET' && method !== 'HEAD' && body) {
          if (body instanceof FormData) {
              options.body = body;
          } else {
              headers['Content-Type'] = 'application/json';
              options.body = JSON.stringify(body);
          }
      }
      
      try {
          const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
          if (response.status === 401) { handleLogout(); return { ok: false, data: { error: 'Сессия истекла.' } }; }
          // Проверяем, есть ли у ответа тело, прежде чем вызывать .json()
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
              const data = await response.json();
              return { ok: response.ok, data };
          } else {
              return { ok: response.ok, data: { message: "Ответ не в формате JSON" } };
          }
      } catch (error) {
          console.error("API Request Error:", error);
          return { ok: false, data: { error: 'Ошибка сети.' } };
      }
  };

  // --- Логика Аутентификации ---
  const handleCheckEmail = async () => {
      currentEmail = inputs.email.value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(currentEmail)) { errors.email.textContent = 'Введите корректный email.'; return; }
      errors.email.textContent = '';
      const { ok, data } = await apiRequest('/check_email', 'POST', { email: currentEmail });
      if (ok) {
          if (!data.allowed) { errors.email.textContent = data.message; return; }
          showStep(data.exists ? 'login' : 'register1');
      } else {
          errors.email.textContent = data.error || 'Ошибка сервера.';
      }
  };

  const handleLogin = async (email, password) => {
      const { ok, data } = await apiRequest('/login', 'POST', { email, password });
      if (ok) { setCookie('authToken', data.token, 24); showAdminPanel(true); } 
      else { errors.login.textContent = data.error || 'Неверный пароль.'; }
  };
  
  const handleRegister = async (email, password) => {
      const { ok, data } = await apiRequest('/register', 'POST', { email, password });
      if (ok) { setCookie('authToken', data.token, 24); showAdminPanel(true); } 
      else { errors.confirm.textContent = data.error || 'Ошибка регистрации.'; }
  };
  
  const handleLogout = () => { eraseCookie('authToken'); showAdminPanel(false); };

  const validatePassword = (password) => {
      const checks = {
          length: password.length >= 8,
          case: /[a-z]/.test(password) && /[A-Z]/.test(password),
          digit: /\d/.test(password),
          special: /[!@#$%]/.test(password),
      };
      Object.keys(checks).forEach(key => passwordRules[key].classList.toggle('valid', checks[key]));
      return Object.values(checks).every(Boolean);
  };

  // --- Логика Панели Администратора ---
  const loadFiles = async () => {
      fileList.innerHTML = '<li>Загрузка...</li>';
      const { ok, data } = await apiRequest('/files');
      fileList.innerHTML = ''; // Очищаем перед заполнением
      if (ok && Array.isArray(data)) {
          if (data.length > 0) {
              data.forEach(file => {
                  const li = document.createElement('li');
                  li.className = 'file-list-item';
                  li.innerHTML = `
                      <div class="file-icon"><span class="material-icons-outlined">insert_drive_file</span></div>
                      <div class="file-details">
                          <div class="file-name" title="${file.name}">${file.name}</div>
                          <div class="file-meta">
                              <span>${formatDate(file.modified_date)}</span>
                              <span>${formatBytes(file.size)}</span>
                          </div>
                      </div>
                      <div class="file-actions">
                          <button class="more-actions-btn" title="Действия">
                              <span class="material-icons-outlined">more_vert</span>
                          </button>
                          <div class="actions-dropdown">
                              <button class="dropdown-item download-file-btn">
                                  <span class="material-icons-outlined">download</span>Скачать
                              </button>
                              <button class="dropdown-item rename-file-btn">
                                  <span class="material-icons-outlined">drive_file_rename_outline</span>Переименовать
                              </button>
                              <button class="dropdown-item delete-file-btn">
                                  <span class="material-icons-outlined">delete_outline</span>Удалить
                              </button>
                          </div>
                      </div>`;
                  li.dataset.filename = file.name;
                  fileList.appendChild(li);
              });
          } else {
               fileList.innerHTML = '<li>Файлы не найдены.</li>';
          }
      } else {
          fileList.innerHTML = `<li>Ошибка загрузки файлов: ${data.error || 'Неизвестная ошибка'}</li>`;
      }
  };

  const handleFileUpload = async (file) => {
      if (!file) { uploadStatus.textContent = 'Пожалуйста, выберите файл.'; return; }
      const formData = new FormData();
      formData.append('file', file);
      uploadStatus.textContent = `Загрузка: ${file.name}...`;
      const { ok, data } = await apiRequest('/upload', 'POST', formData);
      uploadStatus.textContent = data.message || data.error;
      if (ok) {
          setTimeout(() => { uploadStatus.textContent = ''; }, 3000);
          loadFiles();
      }
  };
  
  const handleFileActions = async (e) => {
      const target = e.target;
      const moreButton = target.closest('.more-actions-btn');
      const dropdownItem = target.closest('.dropdown-item');
      
      document.querySelectorAll('.actions-dropdown.visible').forEach(d => {
          if (!d.parentElement.contains(target)) d.classList.remove('visible');
      });

      if (moreButton) {
          moreButton.nextElementSibling.classList.toggle('visible');
          return;
      }
      if (!dropdownItem) return;

      const filename = dropdownItem.closest('.file-list-item').dataset.filename;
      
      if (dropdownItem.classList.contains('rename-file-btn')) {
          const newName = prompt('Введите новое имя файла:', filename);
          if (newName && newName.trim() && newName !== filename) {
              const { ok, data } = await apiRequest(`/rename/${filename}`, 'PUT', { newName: newName.trim() });
              if (ok) loadFiles();
              else alert(`Ошибка: ${data.error || 'Не удалось переименовать файл.'}`);
          }
      } else if (dropdownItem.classList.contains('delete-file-btn')) {
          if (confirm(`Вы уверены, что хотите удалить файл "${filename}"?`)) {
              const { ok, data } = await apiRequest(`/files/${filename}`, 'DELETE');
              if (ok) loadFiles();
              else alert(data.error || 'Ошибка удаления');
          }
      } else if (dropdownItem.classList.contains('download-file-btn')) {
          const token = getCookie('authToken');
          try {
              const res = await fetch(`${API_BASE_URL}/download/${filename}`, { headers: { 'Authorization': `Bearer ${token}` } });
              if (!res.ok) throw new Error(`Сервер ответил с ошибкой: ${res.statusText}`);
              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.style.display = 'none';
              a.href = url;
              a.download = filename;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              a.remove();
          } catch (err) { alert('Не удалось скачать файл.'); }
      }
      dropdownItem.closest('.actions-dropdown').classList.remove('visible');
  };
  
  // --- Назначение Обработчиков ---
  buttons.checkEmail.addEventListener('click', handleCheckEmail);
  buttons.login.addEventListener('click', () => handleLogin(currentEmail, inputs.loginPass.value));
  buttons.setPassword.addEventListener('click', () => {
      const pass = inputs.regPass1.value;
      if (validatePassword(pass)) {
          newPassword = pass;
          errors.register.textContent = '';
          showStep('register2');
      } else {
          errors.register.textContent = 'Пароль не соответствует требованиям.';
      }
  });
  buttons.confirmPassword.addEventListener('click', () => {
      if (inputs.regPass2.value === newPassword) handleRegister(currentEmail, newPassword);
      else errors.confirm.textContent = 'Пароли не совпадают.';
  });
  inputs.regPass1.addEventListener('input', () => validatePassword(inputs.regPass1.value));
  
  const stepToButtonMap = {
      'email': buttons.checkEmail, 'login': buttons.login,
      'register1': buttons.setPassword, 'register2': buttons.confirmPassword,
  };
  Object.values(inputs).forEach(input => {
      if (!input || input.type === 'file') return;
      input.addEventListener('keyup', e => {
          if (e.key === 'Enter') {
              const activeStepKey = e.target.closest('.step').id.replace('-step', '');
              stepToButtonMap[activeStepKey]?.click();
          }
      });
  });

  buttons.logout.addEventListener('click', handleLogout);
  buttons.upload.addEventListener('click', () => inputs.file.click());
  inputs.file.addEventListener('change', () => handleFileUpload(inputs.file.files[0]));
  fileList.addEventListener('click', handleFileActions);

  sidebarNavItems.forEach(item => {
      item.addEventListener('click', (e) => {
          e.preventDefault();
          sidebarNavItems.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          const pageId = `page-${item.dataset.page}`;
          pages.forEach(p => p.classList.remove('active'));
          document.getElementById(pageId)?.classList.add('active');
      });
  });

  // --- Drag and Drop ---
  uploadSection.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadSection.classList.add('drag-over');
  });
  uploadSection.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadSection.classList.remove('drag-over');
  });
  uploadSection.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadSection.classList.remove('drag-over');
      const droppedFile = e.dataTransfer.files[0];
      handleFileUpload(droppedFile);
  });

  document.addEventListener('click', (e) => {
      if (!e.target.closest('.file-actions')) {
          document.querySelectorAll('.actions-dropdown.visible').forEach(d => d.classList.remove('visible'));
      }
  });

  // --- Инициализация ---
  if (getCookie('authToken')) {
      showAdminPanel(true);
  } else {
      showAdminPanel(false);
  }
});
