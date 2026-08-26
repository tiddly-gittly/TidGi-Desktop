export interface WikiAgentLabels {
  agent: string;
  agentControls: string;
  selectAgent: string;
  selectModel: string;
  noOptions: string;
  loadingOptions: string;
  controlsUnavailable: string;
  agentSwitchFailed: string;
  modelUpdateFailed: string;
  promptPreview: string;
  previewLoading: string;
  previewFailed: string;
  previewUnavailable: string;
  previewContext: string;
  previewMessageCount: (count: number) => string;
  previewCompactionCount: (count: number) => string;
  previewIncludesDraft: string;
  schedule: string;
  scheduleUnavailable: string;
  configErrorTitle: string;
  configErrorMessage: (code: string) => string;
  configure: string;
  hostUnavailable: string;
  settingsUnavailable: string;
  runOn: string;
  executionTarget: string;
  runOnTarget: (target: string) => string;
  targetConfirmTitle: string;
  targetConfirmDescription: (target: string) => string;
  anotherTarget: string;
  keepRunning: string;
  stopAndRestart: string;
  remoteAttachmentsUnsupported: string;
  placeholder: string;
  loading: string;
  empty: string;
  genericError: string;
  operationError: string;
  composerInput: string;
  send: string;
  cancel: string;
  addFile: string;
  removeFile: (fileName: string) => string;
  removeTiddler: (workspaceName: string, tiddlerTitle: string) => string;
  timelineNavigation: string;
  compacted: (count: number) => string;
  loadEarlier: string;
  loadLater: string;
  seek: string;
  close: string;
  newMessages: (count: number) => string;
  moreResponses: (count: number) => string;
  retry: string;
  deleteTurn: string;
  copy: string;
  copyAll: string;
  user: string;
  attachment: string;
  attachmentLoadFailed: string;
  noDetails: string;
  loadDetails: string;
  reloadDetails: string;
  hideDetails: string;
  showDetails: string;
  detailTruncated: string;
  detailLoadFailed: string;
  error: string;
  toolResult: string;
  toolCall: (toolName: string) => string;
  truncated: (originalCharacterCount: number) => string;
  answerPlaceholder: string;
  submit: string;
  confirmSelection: string;
  answered: string;
}

type SupportedLocale = 'en' | 'fr' | 'ja' | 'ru' | 'zh-Hans' | 'zh-Hant';

const russianResponsePluralRules = new Intl.PluralRules('ru');

function formatRussianMoreResponses(count: number): string {
  const noun = (() => {
    switch (russianResponsePluralRules.select(count)) {
      case 'one':
        return 'ответ';
      case 'few':
        return 'ответа';
      default:
        return 'ответов';
    }
  })();
  return `Ещё ${count} ${noun} в этом ходе`;
}

const labelsByLocale: Record<SupportedLocale, WikiAgentLabels> = {
  en: {
    agent: 'Agent',
    agentControls: 'Agent controls',
    selectAgent: 'Agent',
    selectModel: 'Model',
    noOptions: 'No options available',
    loadingOptions: 'Loading options…',
    controlsUnavailable: 'Agent controls are temporarily unavailable.',
    agentSwitchFailed: 'The agent could not be switched.',
    modelUpdateFailed: 'The model could not be updated.',
    promptPreview: 'Prompt preview',
    previewLoading: 'Building an execution-equivalent preview…',
    previewFailed: 'The prompt preview could not be generated.',
    previewUnavailable: 'No prompt preview is available.',
    previewContext: 'Bounded conversation context',
    previewMessageCount: count => `${count} conversation messages`,
    previewCompactionCount: count => `${count} compaction summaries`,
    previewIncludesDraft: 'The current unsent draft is included in this preview.',
    schedule: 'Scheduled tasks',
    scheduleUnavailable: 'Scheduled tasks are unavailable for this agent.',
    configErrorTitle: 'Agent configuration required',
    configErrorMessage: code => `Review the AI provider settings and try again. Error code: ${code}`,
    configure: 'Open AI settings',
    hostUnavailable: 'MemeLoop host services are not ready. Configure the Desktop app before using this Wiki view.',
    settingsUnavailable: 'Settings could not be opened. Start the Desktop host and try again.',
    runOn: 'Run on',
    executionTarget: 'Execution target',
    runOnTarget: target => `Run on ${target}`,
    targetConfirmTitle: 'Switch execution target?',
    targetConfirmDescription: target => `Stop the current run and restart on ${target}?`,
    anotherTarget: 'Another device is running this task.',
    keepRunning: 'Keep running',
    stopAndRestart: 'Stop and restart',
    remoteAttachmentsUnsupported: 'File attachments are only available when running on this device.',
    placeholder: 'Message the agent, or drop tiddlers as attachments…',
    loading: 'Loading conversation…',
    empty: 'Start a conversation',
    genericError: 'The conversation could not be loaded.',
    operationError: 'The operation could not be completed.',
    composerInput: 'Message',
    send: 'Send message',
    cancel: 'Stop generating',
    addFile: 'Add file',
    removeFile: file => `Remove ${file}`,
    removeTiddler: (wiki, title) => `Remove ${wiki}: ${title}`,
    timelineNavigation: 'Conversation timeline',
    compacted: count => `${count} messages compacted`,
    loadEarlier: 'Load earlier messages',
    loadLater: 'Load later messages',
    seek: 'Seek in conversation',
    close: 'Close timeline',
    newMessages: count => `${count} new messages — jump to latest`,
    moreResponses: count => `${count} more response${count === 1 ? '' : 's'} in this turn`,
    retry: 'Retry',
    deleteTurn: 'Delete turn',
    copy: 'Copy',
    copyAll: 'Copy all',
    user: 'User',
    attachment: 'Attachment',
    attachmentLoadFailed: 'Attachment preview could not be loaded.',
    noDetails: 'No details available.',
    loadDetails: 'Load details',
    reloadDetails: 'Reload details',
    hideDetails: 'Hide details',
    showDetails: 'Show details',
    detailTruncated: 'Only a bounded detail fragment is shown. Export the conversation for complete content.',
    detailLoadFailed: 'Details could not be loaded.',
    error: 'Error',
    toolResult: 'Tool result',
    toolCall: tool => `Tool call: ${tool}`,
    truncated: count => `Message shortened for display (${count} characters). Export the conversation or load details for the complete content.`,
    answerPlaceholder: 'Your answer…',
    submit: 'Submit',
    confirmSelection: 'Confirm selection',
    answered: 'Answered',
  },
  fr: {
    agent: 'Agent',
    agentControls: 'Commandes de l’agent',
    selectAgent: 'Agent',
    selectModel: 'Modèle',
    noOptions: 'Aucune option disponible',
    loadingOptions: 'Chargement des options…',
    controlsUnavailable: 'Les commandes de l’agent sont temporairement indisponibles.',
    agentSwitchFailed: 'Impossible de changer d’agent.',
    modelUpdateFailed: 'Impossible de mettre à jour le modèle.',
    promptPreview: 'Aperçu du prompt',
    previewLoading: 'Création d’un aperçu équivalent à l’exécution…',
    previewFailed: 'Impossible de générer l’aperçu du prompt.',
    previewUnavailable: 'Aucun aperçu du prompt disponible.',
    previewContext: 'Contexte de conversation limité',
    previewMessageCount: count => `${count} messages de conversation`,
    previewCompactionCount: count => `${count} résumés de compactage`,
    previewIncludesDraft: 'Le brouillon actuel non envoyé est inclus dans cet aperçu.',
    schedule: 'Tâches planifiées',
    scheduleUnavailable: 'Les tâches planifiées ne sont pas disponibles pour cet agent.',
    configErrorTitle: 'Configuration de l’agent requise',
    configErrorMessage: code => `Vérifiez les paramètres du fournisseur IA puis réessayez. Code d’erreur : ${code}`,
    configure: 'Ouvrir les paramètres IA',
    hostUnavailable: 'Les services hôtes MemeLoop ne sont pas prêts. Configurez l’application Desktop avant d’utiliser cette vue Wiki.',
    settingsUnavailable: 'Impossible d’ouvrir les paramètres. Démarrez l’hôte Desktop puis réessayez.',
    runOn: 'Exécuter sur',
    executionTarget: 'Cible d’exécution',
    runOnTarget: target => `Exécuter sur ${target}`,
    targetConfirmTitle: 'Changer de cible d’exécution ?',
    targetConfirmDescription: target => `Arrêter l’exécution actuelle et redémarrer sur ${target} ?`,
    anotherTarget: 'Un autre appareil exécute cette tâche.',
    keepRunning: 'Continuer',
    stopAndRestart: 'Arrêter et redémarrer',
    remoteAttachmentsUnsupported: 'Les fichiers joints ne sont disponibles que lors de l’exécution sur cet appareil.',
    placeholder: 'Écrivez à l’agent ou déposez des tiddlers en pièces jointes…',
    loading: 'Chargement de la conversation…',
    empty: 'Démarrer une conversation',
    genericError: 'Impossible de charger la conversation.',
    operationError: 'Impossible de terminer l’opération.',
    composerInput: 'Message',
    send: 'Envoyer le message',
    cancel: 'Arrêter la génération',
    addFile: 'Ajouter un fichier',
    removeFile: file => `Retirer ${file}`,
    removeTiddler: (wiki, title) => `Retirer ${wiki} : ${title}`,
    timelineNavigation: 'Chronologie de la conversation',
    compacted: count => `${count} messages compactés`,
    loadEarlier: 'Charger les messages précédents',
    loadLater: 'Charger les messages suivants',
    seek: 'Parcourir la conversation',
    close: 'Fermer la chronologie',
    newMessages: count => `${count} nouveaux messages — aller aux plus récents`,
    moreResponses: count => `${count} réponse${count === 1 ? '' : 's'} supplémentaire${count === 1 ? '' : 's'} dans ce tour`,
    retry: 'Réessayer',
    deleteTurn: 'Supprimer ce tour',
    copy: 'Copier',
    copyAll: 'Tout copier',
    user: 'Utilisateur',
    attachment: 'Pièce jointe',
    attachmentLoadFailed: 'Impossible de charger l’aperçu de la pièce jointe.',
    noDetails: 'Aucun détail disponible.',
    loadDetails: 'Charger les détails',
    reloadDetails: 'Recharger les détails',
    hideDetails: 'Masquer les détails',
    showDetails: 'Afficher les détails',
    detailTruncated: 'Seul un extrait limité est affiché. Exportez la conversation pour obtenir le contenu complet.',
    detailLoadFailed: 'Impossible de charger les détails.',
    error: 'Erreur',
    toolResult: 'Résultat de l’outil',
    toolCall: tool => `Appel d’outil : ${tool}`,
    truncated: count => `Message raccourci pour l’affichage (${count} caractères). Exportez la conversation ou chargez les détails pour voir le contenu complet.`,
    answerPlaceholder: 'Votre réponse…',
    submit: 'Envoyer',
    confirmSelection: 'Confirmer la sélection',
    answered: 'Répondu',
  },
  ja: {
    agent: 'エージェント',
    agentControls: 'エージェント操作',
    selectAgent: 'エージェント',
    selectModel: 'モデル',
    noOptions: '選択肢がありません',
    loadingOptions: '選択肢を読み込み中…',
    controlsUnavailable: 'エージェント操作を一時的に利用できません。',
    agentSwitchFailed: 'エージェントを切り替えられませんでした。',
    modelUpdateFailed: 'モデルを更新できませんでした。',
    promptPreview: 'プロンプトプレビュー',
    previewLoading: '実行時と同等のプレビューを作成中…',
    previewFailed: 'プロンプトプレビューを生成できませんでした。',
    previewUnavailable: '利用できるプロンプトプレビューがありません。',
    previewContext: '制限された会話コンテキスト',
    previewMessageCount: count => `会話メッセージ ${count} 件`,
    previewCompactionCount: count => `圧縮サマリー ${count} 件`,
    previewIncludesDraft: '現在の未送信下書きがこのプレビューに含まれています。',
    schedule: 'スケジュールタスク',
    scheduleUnavailable: 'このエージェントではスケジュールタスクを利用できません。',
    configErrorTitle: 'エージェントの設定が必要です',
    configErrorMessage: code => `AI プロバイダー設定を確認して再試行してください。エラーコード: ${code}`,
    configure: 'AI 設定を開く',
    hostUnavailable: 'MemeLoop ホストサービスの準備ができていません。この Wiki ビューを使う前に Desktop アプリを設定してください。',
    settingsUnavailable: '設定を開けませんでした。Desktop ホストを起動して再試行してください。',
    runOn: '実行先',
    executionTarget: '実行対象',
    runOnTarget: target => `${target} で実行`,
    targetConfirmTitle: '実行対象を切り替えますか？',
    targetConfirmDescription: target => `現在の実行を停止し、${target} で再開しますか？`,
    anotherTarget: '別のデバイスでこのタスクを実行中です。',
    keepRunning: '実行を継続',
    stopAndRestart: '停止して再開',
    remoteAttachmentsUnsupported: 'ファイル添付はこのデバイスで実行する場合のみ利用できます。',
    placeholder: 'メッセージを入力するか、Tiddler を添付としてドロップ…',
    loading: '会話を読み込み中…',
    empty: '会話を始める',
    genericError: '会話を読み込めませんでした。',
    operationError: '操作を完了できませんでした。',
    composerInput: 'メッセージ',
    send: 'メッセージを送信',
    cancel: '生成を停止',
    addFile: 'ファイルを追加',
    removeFile: file => `${file} を削除`,
    removeTiddler: (wiki, title) => `${wiki}: ${title} を削除`,
    timelineNavigation: '会話タイムライン',
    compacted: count => `${count} 件のメッセージを圧縮済み`,
    loadEarlier: '以前のメッセージを読み込む',
    loadLater: '以降のメッセージを読み込む',
    seek: '会話内を移動',
    close: 'タイムラインを閉じる',
    newMessages: count => `新着メッセージ ${count} 件 — 最新へ移動`,
    moreResponses: count => `このターンには他に ${count} 件の応答があります`,
    retry: '再試行',
    deleteTurn: 'このターンを削除',
    copy: 'コピー',
    copyAll: 'すべてコピー',
    user: 'ユーザー',
    attachment: '添付ファイル',
    attachmentLoadFailed: '添付ファイルのプレビューを読み込めませんでした。',
    noDetails: '詳細はありません。',
    loadDetails: '詳細を読み込む',
    reloadDetails: '詳細を再読み込み',
    hideDetails: '詳細を隠す',
    showDetails: '詳細を表示',
    detailTruncated: '制限された詳細のみ表示しています。完全な内容は会話をエクスポートしてください。',
    detailLoadFailed: '詳細を読み込めませんでした。',
    error: 'エラー',
    toolResult: 'ツールの結果',
    toolCall: tool => `ツール呼び出し: ${tool}`,
    truncated: count => `表示用にメッセージを短縮しました（${count} 文字）。完全な内容は会話をエクスポートするか詳細を読み込んでください。`,
    answerPlaceholder: '回答を入力…',
    submit: '送信',
    confirmSelection: '選択を確定',
    answered: '回答済み',
  },
  ru: {
    agent: 'Агент',
    agentControls: 'Управление агентом',
    selectAgent: 'Агент',
    selectModel: 'Модель',
    noOptions: 'Нет доступных вариантов',
    loadingOptions: 'Загрузка вариантов…',
    controlsUnavailable: 'Управление агентом временно недоступно.',
    agentSwitchFailed: 'Не удалось переключить агента.',
    modelUpdateFailed: 'Не удалось обновить модель.',
    promptPreview: 'Предпросмотр промпта',
    previewLoading: 'Создание эквивалентного выполнению предпросмотра…',
    previewFailed: 'Не удалось создать предпросмотр промпта.',
    previewUnavailable: 'Предпросмотр промпта недоступен.',
    previewContext: 'Ограниченный контекст диалога',
    previewMessageCount: count => `Сообщений в диалоге: ${count}`,
    previewCompactionCount: count => `Сводок сжатия: ${count}`,
    previewIncludesDraft: 'Текущий неотправленный черновик включён в предпросмотр.',
    schedule: 'Запланированные задачи',
    scheduleUnavailable: 'Запланированные задачи недоступны для этого агента.',
    configErrorTitle: 'Требуется настройка агента',
    configErrorMessage: code => `Проверьте настройки поставщика ИИ и повторите попытку. Код ошибки: ${code}`,
    configure: 'Открыть настройки ИИ',
    hostUnavailable: 'Службы MemeLoop ещё не готовы. Настройте Desktop-приложение перед использованием этого Wiki-представления.',
    settingsUnavailable: 'Не удалось открыть настройки. Запустите Desktop-хост и повторите попытку.',
    runOn: 'Запустить на',
    executionTarget: 'Устройство выполнения',
    runOnTarget: target => `Запустить на ${target}`,
    targetConfirmTitle: 'Сменить устройство выполнения?',
    targetConfirmDescription: target => `Остановить текущий запуск и перезапустить на ${target}?`,
    anotherTarget: 'Эту задачу выполняет другое устройство.',
    keepRunning: 'Продолжить выполнение',
    stopAndRestart: 'Остановить и перезапустить',
    remoteAttachmentsUnsupported: 'Файлы можно прикреплять только при выполнении на этом устройстве.',
    placeholder: 'Напишите агенту или перетащите тиддлеры как вложения…',
    loading: 'Загрузка диалога…',
    empty: 'Начать диалог',
    genericError: 'Не удалось загрузить диалог.',
    operationError: 'Не удалось выполнить операцию.',
    composerInput: 'Сообщение',
    send: 'Отправить сообщение',
    cancel: 'Остановить генерацию',
    addFile: 'Добавить файл',
    removeFile: file => `Удалить ${file}`,
    removeTiddler: (wiki, title) => `Удалить ${wiki}: ${title}`,
    timelineNavigation: 'Хронология диалога',
    compacted: count => `Сжато сообщений: ${count}`,
    loadEarlier: 'Загрузить ранние сообщения',
    loadLater: 'Загрузить поздние сообщения',
    seek: 'Перейти в диалоге',
    close: 'Закрыть хронологию',
    newMessages: count => `Новых сообщений: ${count} — перейти к последним`,
    moreResponses: formatRussianMoreResponses,
    retry: 'Повторить',
    deleteTurn: 'Удалить ход',
    copy: 'Копировать',
    copyAll: 'Копировать всё',
    user: 'Пользователь',
    attachment: 'Вложение',
    attachmentLoadFailed: 'Не удалось загрузить предварительный просмотр вложения.',
    noDetails: 'Подробности недоступны.',
    loadDetails: 'Загрузить подробности',
    reloadDetails: 'Перезагрузить подробности',
    hideDetails: 'Скрыть подробности',
    showDetails: 'Показать подробности',
    detailTruncated: 'Показан только ограниченный фрагмент. Экспортируйте диалог, чтобы получить полное содержимое.',
    detailLoadFailed: 'Не удалось загрузить подробности.',
    error: 'Ошибка',
    toolResult: 'Результат инструмента',
    toolCall: tool => `Вызов инструмента: ${tool}`,
    truncated: count => `Сообщение сокращено для отображения (${count} символов). Экспортируйте диалог или загрузите подробности для полного содержимого.`,
    answerPlaceholder: 'Ваш ответ…',
    submit: 'Отправить',
    confirmSelection: 'Подтвердить выбор',
    answered: 'Отвечено',
  },
  'zh-Hans': {
    agent: '智能体',
    agentControls: '智能体控制',
    selectAgent: '智能体',
    selectModel: '模型',
    noOptions: '没有可用选项',
    loadingOptions: '正在加载选项…',
    controlsUnavailable: '智能体控制暂时不可用。',
    agentSwitchFailed: '无法切换智能体。',
    modelUpdateFailed: '无法更新模型。',
    promptPreview: '提示词预览',
    previewLoading: '正在生成与实际执行等价的预览…',
    previewFailed: '无法生成提示词预览。',
    previewUnavailable: '没有可用的提示词预览。',
    previewContext: '有界对话上下文',
    previewMessageCount: count => `${count} 条对话消息`,
    previewCompactionCount: count => `${count} 条压缩摘要`,
    previewIncludesDraft: '此预览已包含当前尚未发送的草稿。',
    schedule: '定时任务',
    scheduleUnavailable: '此智能体暂时不能使用定时任务。',
    configErrorTitle: '需要配置智能体',
    configErrorMessage: code => `请检查 AI 提供方设置后重试。错误代码：${code}`,
    configure: '打开 AI 设置',
    hostUnavailable: 'MemeLoop 宿主服务尚未就绪。请先在桌面应用中完成配置，再使用此 Wiki 视图。',
    settingsUnavailable: '无法打开设置。请启动桌面宿主后重试。',
    runOn: '运行于',
    executionTarget: '执行目标',
    runOnTarget: target => `在 ${target} 上运行`,
    targetConfirmTitle: '切换执行目标？',
    targetConfirmDescription: target => `停止当前任务并在 ${target} 上重新运行？`,
    anotherTarget: '另一台设备正在运行此任务。',
    keepRunning: '保持运行',
    stopAndRestart: '停止并重新运行',
    remoteAttachmentsUnsupported: '文件附件仅支持在本机执行时使用。',
    placeholder: '输入消息，或拖入条目作为附件…',
    loading: '正在加载对话…',
    empty: '开始一段对话',
    genericError: '无法加载对话。',
    operationError: '无法完成此操作。',
    composerInput: '消息',
    send: '发送消息',
    cancel: '停止生成',
    addFile: '添加文件',
    removeFile: file => `移除 ${file}`,
    removeTiddler: (wiki, title) => `移除 ${wiki}：${title}`,
    timelineNavigation: '对话时间轴',
    compacted: count => `已压缩 ${count} 条消息`,
    loadEarlier: '加载更早内容',
    loadLater: '加载更新内容',
    seek: '在对话中定位',
    close: '关闭时间轴',
    newMessages: count => `${count} 条新消息 — 跳到最新`,
    moreResponses: count => `本轮还有 ${count} 条回复`,
    retry: '重试',
    deleteTurn: '删除此轮',
    copy: '复制',
    copyAll: '复制全部',
    user: '用户',
    attachment: '附件',
    attachmentLoadFailed: '无法加载附件预览。',
    noDetails: '没有可用详情。',
    loadDetails: '加载详情',
    reloadDetails: '重新加载详情',
    hideDetails: '隐藏详情',
    showDetails: '显示详情',
    detailTruncated: '这里只显示有界的详情片段。请导出对话以获取完整内容。',
    detailLoadFailed: '无法加载详情。',
    error: '错误',
    toolResult: '工具结果',
    toolCall: tool => `工具调用：${tool}`,
    truncated: count => `消息过长，已缩短显示（原 ${count} 个字符）。请导出对话或加载详情来查看完整内容。`,
    answerPlaceholder: '输入回答…',
    submit: '提交',
    confirmSelection: '确认选择',
    answered: '已回答',
  },
  'zh-Hant': {
    agent: '智慧體',
    agentControls: '智慧體控制',
    selectAgent: '智慧體',
    selectModel: '模型',
    noOptions: '沒有可用選項',
    loadingOptions: '正在載入選項…',
    controlsUnavailable: '智慧體控制暫時無法使用。',
    agentSwitchFailed: '無法切換智慧體。',
    modelUpdateFailed: '無法更新模型。',
    promptPreview: '提示詞預覽',
    previewLoading: '正在產生與實際執行等價的預覽…',
    previewFailed: '無法產生提示詞預覽。',
    previewUnavailable: '沒有可用的提示詞預覽。',
    previewContext: '有界對話上下文',
    previewMessageCount: count => `${count} 則對話訊息`,
    previewCompactionCount: count => `${count} 則壓縮摘要`,
    previewIncludesDraft: '此預覽已包含目前尚未傳送的草稿。',
    schedule: '排程任務',
    scheduleUnavailable: '此智慧體暫時無法使用排程任務。',
    configErrorTitle: '需要設定智慧體',
    configErrorMessage: code => `請檢查 AI 提供方設定後重試。錯誤代碼：${code}`,
    configure: '開啟 AI 設定',
    hostUnavailable: 'MemeLoop 宿主服務尚未就緒。請先在桌面應用程式完成設定，再使用此 Wiki 檢視。',
    settingsUnavailable: '無法開啟設定。請啟動桌面宿主後重試。',
    runOn: '執行於',
    executionTarget: '執行目標',
    runOnTarget: target => `在 ${target} 上執行`,
    targetConfirmTitle: '切換執行目標？',
    targetConfirmDescription: target => `停止目前任務並在 ${target} 上重新執行？`,
    anotherTarget: '另一台裝置正在執行此任務。',
    keepRunning: '保持執行',
    stopAndRestart: '停止並重新執行',
    remoteAttachmentsUnsupported: '檔案附件僅支援在本機執行時使用。',
    placeholder: '輸入訊息，或拖入條目作為附件…',
    loading: '正在載入對話…',
    empty: '開始一段對話',
    genericError: '無法載入對話。',
    operationError: '無法完成此操作。',
    composerInput: '訊息',
    send: '傳送訊息',
    cancel: '停止產生',
    addFile: '加入檔案',
    removeFile: file => `移除 ${file}`,
    removeTiddler: (wiki, title) => `移除 ${wiki}：${title}`,
    timelineNavigation: '對話時間軸',
    compacted: count => `已壓縮 ${count} 則訊息`,
    loadEarlier: '載入較早內容',
    loadLater: '載入較新內容',
    seek: '在對話中定位',
    close: '關閉時間軸',
    newMessages: count => `${count} 則新訊息 — 跳到最新`,
    moreResponses: count => `本輪還有 ${count} 則回覆`,
    retry: '重試',
    deleteTurn: '刪除此輪',
    copy: '複製',
    copyAll: '全部複製',
    user: '使用者',
    attachment: '附件',
    attachmentLoadFailed: '無法載入附件預覽。',
    noDetails: '沒有可用詳情。',
    loadDetails: '載入詳情',
    reloadDetails: '重新載入詳情',
    hideDetails: '隱藏詳情',
    showDetails: '顯示詳情',
    detailTruncated: '這裡只顯示有界的詳情片段。請匯出對話以取得完整內容。',
    detailLoadFailed: '無法載入詳情。',
    error: '錯誤',
    toolResult: '工具結果',
    toolCall: tool => `工具呼叫：${tool}`,
    truncated: count => `訊息過長，已縮短顯示（原 ${count} 個字元）。請匯出對話或載入詳情來查看完整內容。`,
    answerPlaceholder: '輸入回答…',
    submit: '提交',
    confirmSelection: '確認選擇',
    answered: '已回答',
  },
};

export function resolveWikiAgentLocale(language: string): SupportedLocale {
  const normalized = language.toLowerCase();
  if (normalized.includes('zh-hant') || normalized.includes('zh-tw') || normalized.includes('zh-hk')) return 'zh-Hant';
  if (normalized.includes('zh')) return 'zh-Hans';
  if (normalized.includes('ja')) return 'ja';
  if (normalized.includes('fr')) return 'fr';
  if (normalized.includes('ru')) return 'ru';
  return 'en';
}

export function getWikiAgentLabels(language: string): WikiAgentLabels {
  return labelsByLocale[resolveWikiAgentLocale(language)];
}

/** The shared rail already supplies a one-based index. */
export function formatTimelineTurn(index: number, total: number, locale: SupportedLocale): string {
  if (locale === 'zh-Hans') return `第 ${index} / ${total} 轮`;
  if (locale === 'zh-Hant') return `第 ${index} / ${total} 輪`;
  if (locale === 'ja') return `${index} / ${total} ターン`;
  if (locale === 'fr') return `Tour ${index} sur ${total}`;
  if (locale === 'ru') return `Ход ${index} из ${total}`;
  return `Turn ${index} of ${total}`;
}

export const supportedWikiAgentLocales = Object.keys(labelsByLocale) as SupportedLocale[];
