/* ------------------------------------------------------------------
   マイタスク 画面モック
   バックエンド・DB は使わない。データは下の state（メモリ上）のみ。
   リロードすると初期状態に戻る。
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var MAX_TITLE = 100;
  var MAX_DESCRIPTION = 5000;
  var MAX_LIST_NAME = 50;
  var DONE_VISIBLE_COUNT = 9; // F-14: 完了列の初期表示件数

  // ---------------- サンプルデータ ----------------

  // 「今日」を基準に相対で期限を作る。日付を跨いでも色分けの見本が崩れないようにするため。
  function dueFromToday(offsetDays, hour, minute) {
    var d = new Date();
    d.setHours(hour || 0, minute || 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return d;
  }

  var nextId = 1;
  function id() { return nextId++; }

  var state = {
    lists: [],
    cards: [],
    doneExpanded: false,
    selectedCardIds: {}
  };

  function seed() {
    var todo = { id: id(), name: 'TODO', position: 1, isDefault: true, isFixedLast: false };
    var doing = { id: id(), name: '進行中', position: 2, isDefault: true, isFixedLast: false };
    var design = { id: id(), name: '設計', position: 3, isDefault: false, isFixedLast: false };
    var done = { id: id(), name: '完了', position: 4, isDefault: true, isFixedLast: true };
    state.lists = [todo, doing, design, done];

    state.cards = [
      // 期限による色分け（F-11）の5パターンをすべて TODO 列に並べる
      card(todo, '請求書送付（期限超過）', dueFromToday(-1, 9, 0), true,
        '8月分の請求書をまとめて送付する。\n\n・A社\n・B社\n・C社'),
      card(todo, '定例会の資料提出（当日）', dueFromToday(0, 17, 30), true, ''),
      card(todo, '買い物（翌日）', dueFromToday(1, 0, 0), false, '牛乳、卵、パン'),
      card(todo, '健康診断の予約（3日以内）', dueFromToday(3, 10, 0), true, ''),
      card(todo, '年末の棚卸し（4日以降）', dueFromToday(10, 0, 0), false, ''),
      card(todo, '読みたい本を探す（期限なし）', null, false, '期限を設定していないタスク。'),
      card(todo, '来年の契約更新', new Date(new Date().getFullYear() + 1, 0, 5, 0, 0), false,
        '今年と異なる年なので、年つきで表示される（F-10）。'),

      card(doing, '設計書のレビュー', dueFromToday(2, 15, 0), true,
        '画面設計とAPI設計の突き合わせ。'),
      card(doing, 'モックの配色決め', null, false, '')
      // 「設計」列は空状態の見本としてタスクを置かない
    ];

    // 完了列は折りたたみ（F-14）を確認するため 12 件
    var doneTitles = [
      '打合せ', '見積提出', '契約書の押印', '請求書の確認', 'ドメイン取得',
      '開発環境の構築', 'リポジトリ作成', '要件のヒアリング', 'キックオフ',
      '10件目のタスク', '11件目のタスク', '12件目のタスク'
    ];
    doneTitles.forEach(function (t, i) {
      // 完了列は期限に関わらず薄グレーになる（機能仕様書 2.7）。
      // 差し戻すと色が復活することを確かめられるよう、期限を持たせておく。
      state.cards.push(card(done, t, dueFromToday(-20 + i, 0, 0), false, ''));
    });

    state.lists.forEach(function (l) { renumber(l.id); });
  }

  function card(list, title, dueAt, hasDueTime, description) {
    var siblings = state.cards.filter(function (c) { return c.listId === list.id; });
    return {
      id: id(),
      listId: list.id,
      title: title,
      description: description || '',
      dueAt: dueAt || null,
      hasDueTime: !!hasDueTime,
      position: siblings.length + 1
    };
  }

  // ---------------- 参照ヘルパ ----------------

  function sortedLists() {
    return state.lists.slice().sort(function (a, b) { return a.position - b.position; });
  }

  function cardsOf(listId) {
    return state.cards
      .filter(function (c) { return c.listId === listId; })
      .sort(function (a, b) { return a.position - b.position; });
  }

  function findList(listId) {
    return state.lists.filter(function (l) { return l.id === listId; })[0];
  }

  function findCard(cardId) {
    return state.cards.filter(function (c) { return c.id === cardId; })[0];
  }

  function doneList() {
    return state.lists.filter(function (l) { return l.isFixedLast; })[0];
  }

  // 並び順を 1 から振り直す
  function renumber(listId) {
    cardsOf(listId).forEach(function (c, i) { c.position = i + 1; });
  }

  // ---------------- 期限の表示（F-10） ----------------

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function formatDue(c) {
    if (!c.dueAt) return '';
    var d = c.dueAt;
    var text = pad2(d.getMonth() + 1) + '/' + pad2(d.getDate());
    if (d.getFullYear() !== new Date().getFullYear()) {
      text = d.getFullYear() + '/' + text;
    }
    if (c.hasDueTime) {
      text += ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    return text;
  }

  // ---------------- 期限による色分け（F-11） ----------------

  function dueClass(c) {
    if (!c.dueAt) return '';
    var now = new Date();
    if (c.dueAt.getTime() <= now.getTime()) return 'card--overdue';

    var startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    var days = Math.floor((c.dueAt.getTime() - startOfToday.getTime()) / 86400000);

    if (days === 0) return 'card--today';
    if (days === 1) return 'card--tomorrow';
    if (days <= 3) return 'card--soon';
    return '';
  }

  // ---------------- 描画 ----------------

  var boardEl = document.getElementById('board');

  function render() {
    boardEl.textContent = '';
    var lists = sortedLists();

    lists.forEach(function (list, index) {
      boardEl.appendChild(renderList(list, index, lists));
    });

    boardEl.appendChild(renderAddListButton());
    applyDoneCollapse();
  }

  function renderList(list, index, lists) {
    var el = document.createElement('section');
    el.className = 'list';

    // --- 見出し ---
    var header = document.createElement('div');
    header.className = 'list__header';

    // 「完了」は並び替え不可（F-05）
    if (!list.isFixedLast) {
      header.appendChild(iconButton('←', '左へ移動', index === 0, function () {
        moveList(list, -1);
      }));
    }

    var name = document.createElement('h2');
    name.className = 'list__name';
    name.textContent = list.name;
    header.appendChild(name);

    if (!list.isFixedLast) {
      // 「完了」より右へは移動できない
      var isLastMovable = index >= lists.length - 2;
      header.appendChild(iconButton('→', '右へ移動', isLastMovable, function () {
        moveList(list, 1);
      }));
    }
    el.appendChild(header);

    // --- 改名・削除は追加した列だけ（F-03, F-04） ---
    if (!list.isDefault) {
      var admin = document.createElement('div');
      admin.className = 'list__admin';
      admin.appendChild(iconButton('改名', '列の名前を変更', false, function () {
        renameList(list);
      }));
      admin.appendChild(iconButton('削除', '列を削除', false, function () {
        deleteList(list);
      }));
      el.appendChild(admin);
    }

    var cards = cardsOf(list.id);

    // --- 完了列の「すべて選択」（F-15） ---
    if (list.isFixedLast) {
      el.appendChild(renderSelectAll(cards));
    }

    // --- タスク ---
    // タスク追加は列の最上部（F-06）。新規タスクはこのすぐ下に入る
    el.appendChild(textButton('+ タスク追加', function () { addCard(list); }));

    if (cards.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'list__empty';
      empty.textContent = '（タスクなし）';
      makeDropTarget(empty, list);   // 空の列にも落とせる（F-13）
      el.appendChild(empty);
    } else {
      var wrap = document.createElement('div');
      wrap.className = 'list__cards';
      if (list.isFixedLast) {
        wrap.dataset.doneCards = 'true';
        if (!state.doneExpanded && cards.length > DONE_VISIBLE_COUNT) {
          wrap.classList.add('list__cards--collapsed');
        }
      }
      cards.forEach(function (c) {
        wrap.appendChild(renderCard(c, list));
      });
      makeDropTarget(wrap, list);
      el.appendChild(wrap);

      if (list.isFixedLast && cards.length > DONE_VISIBLE_COUNT) {
        el.appendChild(textButton(
          state.doneExpanded ? '∧ 折りたたむ' : '∨ もっと見る',
          function () {
            state.doneExpanded = !state.doneExpanded;
            render();
          }
        ));
      }
    }

    // --- 選択したものを削除（F-15） ---
    if (list.isFixedLast) {
      var delSelected = textButton('選択したものを削除', function () { deleteSelected(); });
      delSelected.classList.add('btn--danger-text');
      el.appendChild(delSelected);
    }

    return el;
  }

  function renderSelectAll(cards) {
    var label = document.createElement('label');
    label.className = 'select-all';
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = cards.length > 0 && cards.every(function (c) {
      return !!state.selectedCardIds[c.id];
    });
    box.addEventListener('change', function () {
      cards.forEach(function (c) {
        if (box.checked) state.selectedCardIds[c.id] = true;
        else delete state.selectedCardIds[c.id];
      });
      render();
    });
    label.appendChild(box);
    var text = document.createElement('span');
    text.textContent = 'すべて選択';
    label.appendChild(text);
    return label;
  }

  function renderCard(c, list) {
    var row = document.createElement('div');
    row.className = 'card-row';
    row.dataset.cardId = c.id;

    // チェックボックスは「完了」列のタスクにのみ（F-15）
    if (list.isFixedLast) {
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'card-row__check';
      box.checked = !!state.selectedCardIds[c.id];
      box.addEventListener('change', function () {
        if (box.checked) state.selectedCardIds[c.id] = true;
        else delete state.selectedCardIds[c.id];
        render();
      });
      row.appendChild(box);
    }

    var el = document.createElement('article');
    el.className = 'card';
    el.draggable = true;               // 移動はドラッグ&ドロップのみ（F-13）
    el.addEventListener('dragstart', function (e) {
      draggingCardId = c.id;
      e.dataTransfer.effectAllowed = 'move';
      // Firefox はデータをセットしないとドラッグが始まらない
      e.dataTransfer.setData('text/plain', String(c.id));
      // クラス付与を次のフレームに回す。dragstart 中に見た目を変えると
      // ドラッグ画像にその変更が写り込む
      setTimeout(function () { el.classList.add('card--dragging'); }, 0);
    });
    el.addEventListener('dragend', function () {
      draggingCardId = null;
      clearDropMarkers();
      el.classList.remove('card--dragging');
    });

    // 完了列に在ることだけを条件に上書きする（機能仕様書 2.7）
    if (list.isFixedLast) {
      el.classList.add('card--done');
    } else {
      var cls = dueClass(c);
      if (cls) el.classList.add(cls);
    }

    var title = document.createElement('button');
    title.type = 'button';
    title.className = 'card__title';
    title.draggable = false;  // ボタン上から掴んでもカード全体のドラッグが始まるように
    title.textContent = c.title;
    title.addEventListener('click', function () { openModal(c); });
    el.appendChild(title);

    if (c.dueAt) {
      var due = document.createElement('p');
      due.className = 'card__due';
      due.textContent = formatDue(c);
      el.appendChild(due);
    }

    // 移動ボタンは持たない（F-12 は欠番）。削除のみ残す
    var actions = document.createElement('div');
    actions.className = 'card__actions';
    var del = iconButton('削除', 'タスクを削除', false, function () { deleteCard(c); });
    del.classList.add('card__delete');
    actions.appendChild(del);
    el.appendChild(actions);

    row.appendChild(el);
    return row;
  }

  function renderAddListButton() {
    var wrap = document.createElement('div');
    wrap.className = 'board__add-list';
    // 追加した列は「完了」の左隣に入る（F-02）
    wrap.appendChild(textButton('+ リスト追加', addList));
    return wrap;
  }

  function iconButton(label, title, disabled, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--icon';
    b.textContent = label;
    b.title = title;
    b.disabled = !!disabled;
    if (!disabled) b.addEventListener('click', onClick);
    return b;
  }

  function textButton(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--block';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------------- ドラッグ&ドロップ（F-13） ----------------

  var draggingCardId = null;

  // 挿入位置を示す線をすべて消す
  function clearDropMarkers() {
    Array.prototype.forEach.call(
      boardEl.querySelectorAll('.card-row--drop-before, .card-row--drop-after, .list__empty--drop'),
      function (el) {
        el.classList.remove('card-row--drop-before', 'card-row--drop-after', 'list__empty--drop');
      }
    );
  }

  // ポインタのY座標から、そのリスト内での挿入位置（0..件数）を求める。
  // 各タスクの中点より上なら手前、下なら奥に入る。
  function dropIndexAt(container, clientY) {
    var rows = container.querySelectorAll('.card-row');
    for (var i = 0; i < rows.length; i++) {
      var box = rows[i].getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return i;
    }
    return rows.length;
  }

  // 挿入位置に線を出す。末尾に入る場合は最後のタスクの下に出す
  function showDropMarker(container, index) {
    clearDropMarkers();
    var rows = container.querySelectorAll('.card-row');
    if (rows.length === 0) {
      container.classList.add('list__empty--drop');
    } else if (index < rows.length) {
      rows[index].classList.add('card-row--drop-before');
    } else {
      rows[rows.length - 1].classList.add('card-row--drop-after');
    }
  }

  function makeDropTarget(container, list) {
    container.addEventListener('dragover', function (e) {
      if (draggingCardId === null) return;
      e.preventDefault();                     // これが無いと drop が発火しない
      e.dataTransfer.dropEffect = 'move';
      showDropMarker(container, dropIndexAt(container, e.clientY));
    });

    container.addEventListener('drop', function (e) {
      if (draggingCardId === null) return;
      e.preventDefault();
      e.stopPropagation();
      dropCard(findCard(draggingCardId), list, dropIndexAt(container, e.clientY));
    });
  }

  // ボード上のどこで離しても、掴んだ状態が残らないようにする
  boardEl.addEventListener('dragover', function (e) {
    if (draggingCardId !== null) e.preventDefault();
  });
  boardEl.addEventListener('drop', function () { clearDropMarkers(); });

  function dropCard(c, toList, index) {
    if (!c) return;
    var fromListId = c.listId;
    var sameList = fromListId === toList.id;

    // 同じリスト内では、自分より後ろの位置に落とすと自分の分だけ添え字がずれる
    if (sameList) {
      var currentIndex = cardsOf(fromListId).indexOf(c);
      if (index > currentIndex) index -= 1;
      if (index === currentIndex) { clearDropMarkers(); return; }
    }

    c.listId = toList.id;
    // 挿入位置の前後に来るよう、中間の値を振ってから振り直す
    c.position = index - 0.5;
    if (!sameList) renumber(fromListId);
    renumber(toList.id);

    // 完了列から出たタスクは選択状態を持たない
    if (findList(fromListId).isFixedLast && !toList.isFixedLast) {
      delete state.selectedCardIds[c.id];
    }
    draggingCardId = null;
    render();
  }

  // 10件目のタスクが上部だけ覗く高さに切る（F-14）
  function applyDoneCollapse() {
    var wrap = boardEl.querySelector('.list__cards--collapsed');
    if (!wrap) return;
    var rows = wrap.children;
    if (rows.length <= DONE_VISIBLE_COUNT) return;
    var tenth = rows[DONE_VISIBLE_COUNT];
    var top = tenth.offsetTop - wrap.offsetTop;
    wrap.style.maxHeight = (top + 26) + 'px';
  }

  // ---------------- 列の操作 ----------------

  function moveList(list, delta) {
    var lists = sortedLists();
    var i = lists.indexOf(list);
    var j = i + delta;
    if (j < 0 || j >= lists.length) return;
    if (lists[j].isFixedLast) return; // 「完了」より右へは移動できない
    var tmp = lists[i].position;
    lists[i].position = lists[j].position;
    lists[j].position = tmp;
    render();
  }

  function addList() {
    var name = prompt('リスト名（' + MAX_LIST_NAME + '文字まで）', '');
    if (name === null) return;
    name = name.trim();
    if (!name) return;
    if (name.length > MAX_LIST_NAME) name = name.slice(0, MAX_LIST_NAME);

    // 「完了」の左隣に挿入する
    var done = doneList();
    sortedLists().forEach(function (l) {
      if (l.position >= done.position) l.position += 1;
    });
    state.lists.push({
      id: id(),
      name: name,
      position: done.position - 1,
      isDefault: false,
      isFixedLast: false
    });
    render();
  }

  function renameList(list) {
    var name = prompt('リスト名（' + MAX_LIST_NAME + '文字まで）', list.name);
    if (name === null) return;
    name = name.trim();
    if (!name) return;
    list.name = name.slice(0, MAX_LIST_NAME);
    render();
  }

  function deleteList(list) {
    var count = cardsOf(list.id).length;
    var message = '「' + list.name + '」を削除します。'
      + (count > 0 ? '\n中のタスク ' + count + ' 件も一緒に削除されます。' : '')
      + '\nよろしいですか？';
    if (!confirm(message)) return;
    state.cards = state.cards.filter(function (c) { return c.listId !== list.id; });
    state.lists = state.lists.filter(function (l) { return l.id !== list.id; });
    sortedLists().forEach(function (l, i) { l.position = i + 1; });
    render();
  }

  // ---------------- タスクの操作 ----------------

  function addCard(list) {
    var title = prompt('タスクのタイトル（' + MAX_TITLE + '文字まで）', '');
    if (title === null) return;
    title = title.trim();
    if (!title) return;
    // 列の先頭に入れる（F-06）。既存タスクは後ろへずれる
    state.cards.push({
      id: id(),
      listId: list.id,
      title: title.slice(0, MAX_TITLE),
      description: '',
      dueAt: null,
      hasDueTime: false,
      position: 0
    });
    renumber(list.id);
    // 完了列は折りたたまれていると先頭が見えるので展開は不要
    render();
  }

  // 詳細モーダルからのリスト移動（F-23）。移動先は末尾
  function moveCardToList(c, toListId) {
    var fromListId = c.listId;
    if (fromListId === toListId) return;
    c.listId = toListId;
    c.position = cardsOf(toListId).length; // 自分を含めた件数＝末尾の位置
    renumber(fromListId);
    renumber(toListId);
    // 完了列から出たタスクは選択状態を持たない
    if (findList(fromListId).isFixedLast) delete state.selectedCardIds[c.id];
  }

  function deleteCard(c) {
    if (!confirm('「' + c.title + '」を削除します。よろしいですか？')) return;
    var listId = c.listId;
    state.cards = state.cards.filter(function (x) { return x.id !== c.id; });
    delete state.selectedCardIds[c.id];
    renumber(listId);
    render();
  }

  function deleteSelected() {
    var done = doneList();
    var targets = cardsOf(done.id).filter(function (c) {
      return !!state.selectedCardIds[c.id];
    });
    if (targets.length === 0) {
      alert('削除するタスクが選択されていません。');
      return;
    }
    if (!confirm('選択した ' + targets.length + ' 件を削除します。よろしいですか？')) return;
    targets.forEach(function (c) { delete state.selectedCardIds[c.id]; });
    var ids = targets.map(function (c) { return c.id; });
    state.cards = state.cards.filter(function (c) { return ids.indexOf(c.id) === -1; });
    renumber(done.id);
    render();
  }

  // ---------------- 詳細モーダル（F-07） ----------------

  var overlayEl = document.getElementById('modal-overlay');
  var titleInput = document.getElementById('input-title');
  var descInput = document.getElementById('input-description');
  var dateInput = document.getElementById('input-due-date');
  var timeInput = document.getElementById('input-due-time');
  var hasTimeInput = document.getElementById('input-has-due-time');
  var listInput = document.getElementById('input-list');
  var editingCardId = null;

  function openModal(c) {
    editingCardId = c.id;

    // 選択肢は「完了」を含む全リスト（F-23）
    listInput.textContent = '';
    sortedLists().forEach(function (l) {
      var opt = document.createElement('option');
      opt.value = String(l.id);
      opt.textContent = l.name;
      listInput.appendChild(opt);
    });
    listInput.value = String(c.listId);

    titleInput.value = c.title;
    descInput.value = c.description;
    if (c.dueAt) {
      dateInput.value = c.dueAt.getFullYear() + '-' +
        pad2(c.dueAt.getMonth() + 1) + '-' + pad2(c.dueAt.getDate());
      timeInput.value = pad2(c.dueAt.getHours()) + ':' + pad2(c.dueAt.getMinutes());
    } else {
      dateInput.value = '';
      timeInput.value = '';
    }
    hasTimeInput.checked = c.hasDueTime;
    syncTimeInput();
    updateCounter(titleInput, document.getElementById('counter-title'));
    updateCounter(descInput, document.getElementById('counter-description'));
    overlayEl.hidden = false;
    titleInput.focus();
  }

  function closeModal() {
    overlayEl.hidden = true;
    editingCardId = null;
  }

  function saveModal() {
    var c = findCard(editingCardId);
    if (!c) return closeModal();

    var title = titleInput.value.trim();
    if (!title) {
      alert('タイトルは必須です。');
      titleInput.focus();
      return;
    }
    c.title = title;
    c.description = descInput.value;

    // リストが変わっていれば移動先の末尾へ（F-23）
    moveCardToList(c, Number(listInput.value));

    if (dateInput.value) {
      var parts = dateInput.value.split('-');
      var h = 0, m = 0;
      if (hasTimeInput.checked && timeInput.value) {
        var hm = timeInput.value.split(':');
        h = Number(hm[0]);
        m = Number(hm[1]);
      }
      // 時分が未入力なら 00:00 として扱う（機能仕様書 2.4）
      c.dueAt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), h, m);
      c.hasDueTime = hasTimeInput.checked;
    } else {
      c.dueAt = null;
      c.hasDueTime = false;
    }

    closeModal();
    render();
  }

  // 「時刻を指定する」がオフなら時分の入力欄を無効にする
  function syncTimeInput() {
    timeInput.disabled = !hasTimeInput.checked;
  }

  hasTimeInput.addEventListener('change', syncTimeInput);

  document.getElementById('btn-clear-due').addEventListener('click', function () {
    dateInput.value = '';
    timeInput.value = '';
    hasTimeInput.checked = false;
    syncTimeInput();
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveModal);
  overlayEl.addEventListener('click', function (e) {
    if (e.target === overlayEl) closeModal(); // 背景クリックで閉じる
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlayEl.hidden) closeModal();
  });

  // ---------------- 文字数カウンタ（E-01, E-02） ----------------

  function updateCounter(input, counter) {
    var max = Number(input.dataset.max);
    // 上限を超える入力・貼り付けは上限までで切り詰める
    if (input.value.length > max) {
      var pos = input.selectionStart;
      input.value = input.value.slice(0, max);
      if (pos !== null) input.setSelectionRange(Math.min(pos, max), Math.min(pos, max));
    }
    counter.textContent = input.value.length + '/' + max;
    counter.classList.toggle('field__counter--over', input.value.length >= max);
  }

  [[titleInput, 'counter-title'], [descInput, 'counter-description']].forEach(function (pair) {
    var input = pair[0];
    var counter = document.getElementById(pair[1]);
    input.addEventListener('input', function () { updateCounter(input, counter); });
  });

  // ---------------- デモ用のエラー表示切替（モック専用） ----------------

  var bannerEl = document.getElementById('error-banner');
  var fullscreenEl = document.getElementById('error-fullscreen');

  function setDemoState(value) {
    bannerEl.hidden = value !== 'banner';
    fullscreenEl.hidden = value !== 'fullscreen';
    boardEl.hidden = value === 'fullscreen';
    if (!boardEl.hidden) applyDoneCollapse();
  }

  Array.prototype.forEach.call(
    document.querySelectorAll('input[name="demo-state"]'),
    function (radio) {
      radio.addEventListener('change', function () { setDemoState(radio.value); });
    }
  );

  document.getElementById('error-banner-close').addEventListener('click', function () {
    bannerEl.hidden = true;
    document.querySelector('input[name="demo-state"][value="normal"]').checked = true;
  });

  document.getElementById('error-reload').addEventListener('click', function () {
    location.reload();
  });

  // ---------------- 起動 ----------------

  seed();
  render();
})();
