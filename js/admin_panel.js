// ============================================================
// js/admin_panel.js — Админ-панель (V2.3 с Секретными картами)
// ============================================================

import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { esc, showToast, closeModals } from './core.js';

let _db, _auth, _getState;

// ── Модальное окно создания кастомной карточки ───────────────
window.openCreateCardModal = function(cardData = null) {
  const isEdit = !!cardData;
  const modal = document.getElementById('m-admin-card');
  if (!modal) return;

  modal.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this) closeModals()">
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header">
          <h2>${isEdit ? 'Редактировать' : 'Создать'} карточку</h2>
          <button class="modal-close" onclick="closeModals()">✕</button>
        </div>
        <div class="modal-body">
          <form id="card-form">
            <label>Название: <input type="text" name="name" value="${esc(cardData?.name || '')}" required></label>
            <label>Роль: <input type="text" name="role" value="${esc(cardData?.role || '')}"></label>
            <label>Префикс: <input type="text" name="prefix" value="${esc(cardData?.prefix || '')}"></label>
            <label>URL изображения: <input type="text" name="img" value="${esc(cardData?.img || '')}"></label>
            <label>Описание: <textarea name="description">${esc(cardData?.description || '')}</textarea></label>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
              <label>Редкость:
                <select name="rarity">
                  <option value="common" ${cardData?.rarity==='common'?'selected':''}>Обычная</option>
                  <option value="rare" ${cardData?.rarity==='rare'?'selected':''}>Редкая</option>
                  <option value="epic" ${cardData?.rarity==='epic'?'selected':''}>Эпическая</option>
                  <option value="legendary" ${cardData?.rarity==='legendary'?'selected':''}>Легендарная</option>
                  <option value="topsecret" ${cardData?.rarity==='topsecret'?'selected':''}>Топ-сикрет</option>
                </select>
              </label>
              <label>Шанс выпадения (%):
                <input type="number" name="dropChance" value="${cardData?.dropChance || 1}" step="0.1" min="0" max="100">
              </label>
            </div>

            <div style="margin-top:15px; padding:10px; background:rgba(239,68,68,0.1); border-radius:8px; border:1px solid rgba(239,68,68,0.3);">
              <label style="display:flex; align-items:center; gap:10px; cursor:pointer; color:#ef4444; font-weight:bold;">
                <input type="checkbox" name="isSecret" ${cardData?.isSecret ? 'checked' : ''} style="width:20px; height:20px;">
                ЗАСЕКРЕЧЕННАЯ КАРТОЧКА
              </label>
              <p style="font-size:11px; color:var(--text-dim); margin-top:5px;">
                * При выпадении будет отображаться как "Неизвестно" с вопросительным знаком. Информация раскроется только в инвентаре.
              </p>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModals()">Отмена</button>
          <button class="btn btn-blue" onclick="saveCustomCard('${cardData?.id || ''}')">Сохранить</button>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

window.saveCustomCard = async function(cardId) {
  const form = document.getElementById('card-form');
  const fd = new FormData(form);
  
  const data = {
    name: fd.get('name'),
    role: fd.get('role'),
    prefix: fd.get('prefix'),
    img: fd.get('img'),
    description: fd.get('description'),
    rarity: fd.get('rarity'),
    dropChance: parseFloat(fd.get('dropChance')) || 1,
    isSecret: form.querySelector('[name="isSecret"]').checked,
    updatedAt: Date.now()
  };

  try {
    if (cardId) {
      await updateDoc(doc(_db, 'custom_cards', cardId), data);
      showToast('Карточка обновлена');
    } else {
      await addDoc(collection(_db, 'custom_cards'), { ...data, createdAt: Date.now() });
      showToast('Карточка создана');
    }
    closeModals();
    if (window.renderLootboxPage) {
        const wrap = document.querySelector('.lootbox-page')?.parentElement;
        const { userData } = _getState();
        if (wrap) window.renderLootboxPage(wrap, userData?.vcoins || 0);
    }
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
};

export function bindAdminPanel(db, auth, getState) {
  _db = db;
  _auth = auth;
  _getState = getState;
}
