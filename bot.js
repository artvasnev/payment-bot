// Telegram бот для расчёта оплат мастеров поддержки
const TelegramBot = require('node-telegram-bot-api');

// Получаем токен из переменных окружения
const token = process.env.BOT_TOKEN || '7581144814:AAGPfo6zeT6vJDW5RlH5B5BpAr8-fhyeOLU';

console.log('🔧 Режим работы:', process.env.NODE_ENV || 'production');
console.log('🤖 Токен загружен:', token ? 'Да' : 'Нет');
console.log('🌐 Запуск бота...');

const bot = new TelegramBot(token, { polling: true });

// Тарифы комиссий
const packageRates = {
    'Стартовый набор': { rate: 0.07, name: 'стартовый набор' },
    'Расширение': { rate: 0.08, name: 'расширение' },
    'Масштаб': { rate: 0.10, name: 'масштаб' },
    'Абсолют': { rate: 0.12, name: 'абсолют' }
};

// Хранилище данных пользователей
const userSessions = {};

// Функция удаления сообщения
async function deleteMessage(chatId, messageId) {
    try {
        await bot.deleteMessage(chatId, messageId);
    } catch (error) {
        // Игнорируем ошибки удаления
    }
}

// Функция форматирования чисел
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Функция форматирования сумм
function formatAmount(num) {
    if (num >= 1000) {
        return (num / 1000) + 'к';
    }
    return num.toString();
}

// Функция генерации сообщения о продаже
function generateSaleMessage(data) {
    const { clientName, masterName, packageType, practicesCount, totalAmount, paidAmount, remainderPayments } = data;
    
    const rate = packageRates[packageType].rate;
    const packageName = packageRates[packageType].name;
    const commission = Math.round(paidAmount * rate);
    const remainder = totalAmount - paidAmount;
    
    const paymentDescription = paidAmount >= totalAmount ? 
        `это один полный перевод за ${practicesCount} практик` : 
        `это один перевод`;
    
    const isFemale = clientName.toLowerCase().endsWith('а') || clientName.toLowerCase().endsWith('я') || clientName.toLowerCase().endsWith('на');
    const masterIsFemale = masterName.toLowerCase().endsWith('а') || masterName.toLowerCase().endsWith('я') || masterName.toLowerCase().endsWith('на');
    
    let message = `Новая продажа!🗝️
${clientName}.
Набор «${packageName}» из ${practicesCount} практик

Вел${masterIsFemale ? 'а' : ''} ${isFemale ? 'её' : 'его'} ${masterName} 👏🏼

Сейчас ${clientName} отправил${isFemale ? 'а' : ''} по факту ${formatAmount(paidAmount)} , ${paymentDescription}

За ведение человека до результата – ${Math.round(rate * 100)}% мастеров поддержки (так как набор ${packageName})

Сейчас с ${formatAmount(paidAmount)} - ${Math.round(rate * 100)}% - это ${formatNumber(commission)} р`;
    
    if (remainder > 0) {
        if (remainderPayments && remainderPayments.length > 0) {
            message += `\nОстаток ${formatAmount(remainder)}:`;
            remainderPayments.forEach((payment) => {
                message += `\n• ${formatAmount(payment.amount)} до ${payment.date}`;
            });
        } else {
            message += `\nОстаток ${formatAmount(remainder)}.`;
        }
    } else {
        message += `\nОстаток 0.`;
        if (packageType === 'Расширение') {
            message += `\nНу если только ещё не решит практики делать😊 думаю, что ещё захочет ещё)`;
        }
    }
    
    if (packageType === 'Стартовый набор') {
        message += `\n\nПошли абонементы! Мы с вами вместе укрепили этот формат 👏🏼`;
    } else if (packageType === 'Масштаб') {
        message += `\n\nЖмём пружину на вершину!`;
    }
    
    return message;
}

// Функция завершения продажи
async function finalizeSale(sessionKey, session) {
    const chatId = session.chatId;
    console.log(`🎯 Генерируем финальное сообщение для ${sessionKey}...`);
    
    for (const messageId of session.messagesToDelete) {
        await deleteMessage(chatId, messageId);
    }
    
    const saleMessage = generateSaleMessage(session.data);
    console.log(`📄 Финальное сообщение готово`);
    
    await bot.sendMessage(chatId, saleMessage, {
        message_thread_id: session.messageThreadId
    });
    
    setTimeout(async () => {
        const actionKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Новый расчёт', callback_data: 'new_calculation' }]
                ]
            }
        };
        
        await bot.sendMessage(chatId, '⬆️', {
            ...actionKeyboard,
            message_thread_id: session.messageThreadId
        });
        
        console.log(`✅ Расчёт завершён успешно для ${sessionKey}!`);
    }, 500);
    
    delete userSessions[sessionKey];
}

// Команда /sale
bot.onText(/\/sale/, async (msg) => {
    const chatId = msg.chat.id;
    const messageThreadId = msg.message_thread_id;
    const sessionKey = `${chatId}_${messageThreadId || 'main'}`;
    
    console.log(`🗝️ Запуск расчёта от ${msg.from.first_name}, ключ: ${sessionKey}`);
    
    if (userSessions[sessionKey]) {
        console.log(`⚠️ Сессия уже активна для ${sessionKey}`);
        await deleteMessage(chatId, msg.message_id);
        return;
    }
    
    await deleteMessage(chatId, msg.message_id);
    
    userSessions[sessionKey] = {
        step: 'clientName',
        data: {},
        messagesToDelete: [],
        messageThreadId: messageThreadId,
        chatId: chatId
    };
    
    const sentMessage = await bot.sendMessage(chatId, '🗝️ *Расчёт новой продажи*\n\nВведите имя клиента:', {
        parse_mode: 'Markdown',
        message_thread_id: messageThreadId
    });
    
    userSessions[sessionKey].messagesToDelete.push(sentMessage.message_id);
    console.log(`✅ Сессия создана с ключом ${sessionKey}`);
});

// Команда /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const messageThreadId = msg.message_thread_id;
    
    await deleteMessage(chatId, msg.message_id);
    
    const welcomeText = `🎉 *Добро пожаловать в бот расчёта оплат!*

🚀 *Команды:*
/sale - начать новый расчёт

💰 *Тарифы комиссий:*
- Стартовый набор - 7%
- Расширение - 8%
- Масштаб - 10%
- Абсолют - 12%

Просто введите /sale и следуйте инструкциям!`;
    
    const welcomeMessage = await bot.sendMessage(chatId, welcomeText, { 
        parse_mode: 'Markdown',
        message_thread_id: messageThreadId
    });
    
    setTimeout(async () => {
        await deleteMessage(chatId, welcomeMessage.message_id);
    }, 10000);
});

// Обработка callback данных
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const messageThreadId = message.message_thread_id;
    const data = callbackQuery.data;
    const sessionKey = `${chatId}_${messageThreadId || 'main'}`;
    
    if (!userSessions[sessionKey] && data !== 'new_calculation') {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Сессия истекла. Начните заново с /sale' });
        return;
    }
    
    const session = userSessions[sessionKey];
    
    if (session && session.step === 'package') {
        session.data.packageType = data;
        session.step = 'practicesCount';
        console.log(`✅ Выбран пакет: ${data}`);
        
        await bot.editMessageText(
            `✅ Выбран пакет: *${data}* (${Math.round(packageRates[data].rate * 100)}%)\n\nТеперь введите количество практик:`,
            {
                chat_id: chatId,
                message_id: message.message_id,
                parse_mode: 'Markdown',
                message_thread_id: session.messageThreadId
            }
        );
        
        bot.answerCallbackQuery(callbackQuery.id, { text: `Выбран ${data}` });
        return;
    }
    
    if (data === 'new_calculation') {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Начинаем новый расчёт!' });
        
        await deleteMessage(chatId, message.message_id);
        
        userSessions[sessionKey] = {
            step: 'clientName',
            data: {},
            messagesToDelete: [],
            messageThreadId: messageThreadId,
            chatId: chatId
        };
        
        const sentMessage = await bot.sendMessage(chatId, '🗝️ *Новый расчёт продажи*\n\nВведите имя клиента:', {
            parse_mode: 'Markdown',
            message_thread_id: messageThreadId
        });
        
        userSessions[sessionKey].messagesToDelete.push(sentMessage.message_id);
        console.log(`✅ Новая сессия создана с ключом ${sessionKey}`);
    }
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const messageThreadId = msg.message_thread_id;
    const sessionKey = `${chatId}_${messageThreadId || 'main'}`;
    
    if (text && text.startsWith('/')) {
        return;
    }
    
    if (!userSessions[sessionKey]) {
        await deleteMessage(chatId, msg.message_id);
        return;
    }
    
    const session = userSessions[sessionKey];
    console.log(`📝 Обрабатываем "${text}" на шаге: ${session.step}`);
    
    await deleteMessage(chatId, msg.message_id);
    
    switch (session.step) {
        case 'clientName':
            session.data.clientName = text.trim();
            session.step = 'masterName';
            console.log(`✅ Имя клиента: ${session.data.clientName}`);
            
            const masterMessage = await bot.sendMessage(chatId, '👤 Теперь введите имя мастера поддержки, который вёл клиента:', {
                message_thread_id: session.messageThreadId
            });
            session.messagesToDelete.push(masterMessage.message_id);
            break;
            
        case 'masterName':
            session.data.masterName = text.trim();
            session.step = 'package';
            console.log(`✅ Имя мастера: ${session.data.masterName}`);
            
            const packageKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🟢 Стартовый набор (7%)', callback_data: 'Стартовый набор' }],
                        [{ text: '🔵 Расширение (8%)', callback_data: 'Расширение' }],
                        [{ text: '🟡 Масштаб (10%)', callback_data: 'Масштаб' }],
                        [{ text: '🔴 Абсолют (12%)', callback_data: 'Абсолют' }]
                    ]
                }
            };
            
            const packageMessage = await bot.sendMessage(chatId, '📦 Выберите пакет:', {
                ...packageKeyboard,
                message_thread_id: session.messageThreadId
            });
            session.messagesToDelete.push(packageMessage.message_id);
            break;
            
        case 'practicesCount':
            const practicesCount = parseInt(text);
            if (isNaN(practicesCount) || practicesCount < 1) {
                const errorMessage = await bot.sendMessage(chatId, '❌ Пожалуйста, введите корректное количество практик (число больше 0):', {
                    message_thread_id: session.messageThreadId
                });
                session.messagesToDelete.push(errorMessage.message_id);
                return;
            }
            
            session.data.practicesCount = practicesCount;
            session.step = 'totalAmount';
            console.log(`✅ Количество практик: ${practicesCount}`);
            
            const totalMessage = await bot.sendMessage(chatId, '💰 Введите полную стоимость пакета (в рублях):', {
                message_thread_id: session.messageThreadId
            });
            session.messagesToDelete.push(totalMessage.message_id);
            break;
            
        case 'totalAmount':
            const totalAmount = parseFloat(text.replace(/\s/g, ''));
            if (isNaN(totalAmount) || totalAmount <= 0) {
                const errorMessage = await bot.sendMessage(chatId, '❌ Пожалуйста, введите корректную сумму:', {
                    message_thread_id: session.messageThreadId
                });
                session.messagesToDelete.push(errorMessage.message_id);
                return;
            }
            
            session.data.totalAmount = totalAmount;
            session.step = 'paidAmount';
            console.log(`✅ Полная стоимость: ${totalAmount}`);
            
            const paidMessage = await bot.sendMessage(chatId, '💳 Введите сумму, которую клиент оплатил:', {
                message_thread_id: session.messageThreadId
            });
            session.messagesToDelete.push(paidMessage.message_id);
            break;
            
        case 'paidAmount':
            const paidAmount = parseFloat(text.replace(/\s/g, ''));
            if (isNaN(paidAmount) || paidAmount <= 0) {
                const errorMessage = await bot.sendMessage(chatId, '❌ Пожалуйста, введите корректную сумму оплаты:', {
                    message_thread_id: session.messageThreadId
                });
                session.messagesToDelete.push(errorMessage.message_id);
                return;
            }
            
            if (paidAmount > session.data.totalAmount) {
                const errorMessage = await bot.sendMessage(chatId, '⚠️ Оплаченная сумма не может быть больше полной стоимости. Введите корректную сумму:', {
                    message_thread_id: session.messageThreadId
                });
                session.messagesToDelete.push(errorMessage.message_id);
                return;
            }
            
            session.data.paidAmount = paidAmount;
            console.log(`✅ Оплачено: ${paidAmount}`);
            
            const remainder = session.data.totalAmount - paidAmount;
            if (remainder > 0) {
                session.data.remainderPayments = [{ amount: remainder, date: 'не указана' }];
            }
            
            console.log(`✅ Генерируем финальное сообщение`);
            await finalizeSale(sessionKey, session);
            break;
    }
});

console.log('🤖 Бот запущен! Ожидаю команды...');

// Обработка ошибок
bot.on('error', (error) => {
    console.log('❌ Ошибка бота:', error.message);
});

bot.on('polling_error', (error) => {
    console.log('❌ Ошибка polling:', error.message);
});

case 'paidAmount':
            const paidAmount = parseFloat(text.replace(/\s/g, ''));
            if (isNaN(paidAmount) || paidAmount <= 0) {
                const errorMessage = await bot.sendMessage(chatId, '❌ Пожалуйста, введите корректную сумму оплаты:', {
                    message_thread_id: session.messageThreadId
                });
                session.messagesToDelete.push(errorMessage.message_id);
                return;
            }
            
            if (paidAmount > session.data.totalAmount) {
                const errorMessage = await bot.sendMessage(chatId, '⚠️ Оплаченная сумма не может быть больше полной стоимости. Введите корректную сумму:', {
                    message_thread_id: session.messageThreadId
                });
                session.messagesToDelete.push(errorMessage.message_id);
                return;
            }
            
            session.data.paidAmount = paidAmount;
            console.log(`✅ Оплачено: ${paidAmount}`);
            
            const remainder = session.data.totalAmount - paidAmount;
            if (remainder > 0) {
                session.step = 'remainderPayments';
                session.data.remainderPayments = [];
                session.data.remainingAmount = remainder;
                console.log(`💰 Остаток: ${remainder}, спрашиваем про транши`);
                
                const remainderKeyboard = {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Да, указать даты траншей', callback_data: 'add_tranches' }],
                            [{ text: '⏩ Нет, просто указать общий остаток', callback_data: 'skip_tranches' }]
                        ]
                    }
                };
                
                const remainderMessage = await bot.sendMessage(
                    chatId, 
                    `💰 Остаток к доплате: ${formatAmount(remainder)}\n\nХотите указать даты будущих траншей?`, 
                    {
                        ...remainderKeyboard,
                        message_thread_id: session.messageThreadId
                    }
                );
                session.messagesToDelete.push(remainderMessage.message_id);
            } else {
                console.log(`✅ Полная оплата, генерируем финальное сообщение`);
                await finalizeSale(sessionKey, session);
            }
            break;
            
        case 'tranches_count':
            const tranchesCount = parseInt(text);
            if (isNaN(tranchesCount) || tranchesCount < 1) {
                const errorMessage = await bot.sendMessage(chatId, '❌ Введите корректное количество траншей (число больше 0):', {
                    message_thread_id: session.messageThreadId
                });
                session.messagesToDelete.push(errorMessage.message_id);
                return;
            }
            
            session.data.totalTranches = tranchesCount;
            session.data.currentTrancheIndex = 1;
            session.step = 'tranche_amount';
            
            const firstTrancheMessage = await bot.sendMessage(chatId, `💰 Транш 1 из ${tranchesCount}\n\nВведите сумму первого транша:`, {
                message_thread_id: session.messageThreadId
            });
            session.messagesToDelete.push(firstTrancheMessage.message_id);
            break;
            
        case 'tranche_amount':
            const trancheAmount = parseFloat(text.replace(/\s/g, ''));
            if (isNaN(trancheAmount) || trancheAmount <= 0) {
                const errorMessage = await bot.sendMessage(chatId, '❌ Введите корректную сумму транша:', {
                    message_thread_id: session.messageThreadId
                });
                session.messagesToDelete.push(errorMessage.message_id);
                return;
            }
            
            if (trancheAmount > session.data.remainingAmount) {
                const errorMessage = await bot.sendMessage(chatId, `⚠️ Сумма транша не может быть больше остатка (${formatAmount(session.data.remainingAmount)}):`, {
                    message_thread_id: session.messageThreadId
                });
                session.messagesToDelete.push(errorMessage.message_id);
                return;
            }
            
            session.data.currentTranche = { amount: trancheAmount };
            session.step = 'tranche_date';
            
            const dateMessage = await bot.sendMessage(chatId, `📅 Введите дату ${session.data.currentTrancheIndex}-го транша (например: 15.09.25 или 15 сентября):`, {
                message_thread_id: session.messageThreadId
            });
            session.messagesToDelete.push(dateMessage.message_id);
            break;
            
        case 'tranche_date':
            const trancheDate = text.trim();
            session.data.currentTranche.date = trancheDate;
            session.data.remainderPayments.push(session.data.currentTranche);
            session.data.remainingAmount -= session.data.currentTranche.amount;
            session.data.currentTrancheIndex++;
            
            if (session.data.currentTrancheIndex <= session.data.totalTranches && session.data.remainingAmount > 0) {
                session.step = 'tranche_amount';
                const nextTrancheMessage = await bot.sendMessage(
                    chatId,
                    `✅ Транш ${session.data.currentTrancheIndex - 1} добавлен: ${formatAmount(session.data.currentTranche.amount)} до ${trancheDate}\n\n💰 Транш ${session.data.currentTrancheIndex} из ${session.data.totalTranches}\nОстаток: ${formatAmount(session.data.remainingAmount)}\n\nВведите сумму ${session.data.currentTrancheIndex}-го транша:`,
                    {
                        message_thread_id: session.messageThreadId
                    }
                );
                session.messagesToDelete.push(nextTrancheMessage.message_id);
            } else {
                if (session.data.remainingAmount > 0) {
                    session.data.remainderPayments.push({
                        amount: session.data.remainingAmount,
                        date: 'не указана'
                    });
                }
                await finalizeSale(sessionKey, session);
            }
            break;
            
        default:
            const helpMessage = await bot.sendMessage(chatId, 'Для начала расчёта введите /sale', {
                message_thread_id: session?.messageThreadId
            });
            setTimeout(async () => {
                await deleteMessage(chatId, helpMessage.message_id);
            }, 3000);
    }
});

// Команда /pay - просмотр предстоящих платежей
bot.onText(/\/pay/, async (msg) => {
    const chatId = msg.chat.id;
    const messageThreadId = msg.message_thread_id;
    
    console.log(`📊 Запрос списка платежей от пользователя ${msg.from.first_name}`);
    
    await deleteMessage(chatId, msg.message_id);
    
    try {
        const upcomingPayments = await getUpcomingPayments();
        
        if (upcomingPayments.length === 0) {
            const noPaymentsMessage = await bot.sendMessage(chatId, '📋 Нет предстоящих платежей', {
                message_thread_id: messageThreadId
            });
            
            setTimeout(async () => {
                await deleteMessage(chatId, noPaymentsMessage.message_id);
            }, 5000);
            return;
        }
        
        let message = '📅 *Предстоящие платежи:*\n\n';
        
        upcomingPayments.forEach((payment) => {
            const urgencyIcon = payment.daysUntil <= 3 ? '🔴' : payment.daysUntil <= 7 ? '🟡' : '🟢';
            const daysText = payment.daysUntil === 0 ? 'сегодня' : 
                            payment.daysUntil === 1 ? 'завтра' : 
                            `через ${payment.daysUntil} дн.`;
            
            message += `${urgencyIcon} *${payment.clientName}*\n`;
            message += `   Мастер: ${payment.masterName}\n`;
            message += `   Пакет: ${payment.packageType}\n`;
            message += `   Сумма: ${formatAmount(payment.amount)}\n`;
            message += `   До: ${payment.dueDateStr} (${daysText})\n\n`;
        });
        
        message += `\n🔴 Срочно (≤3 дней) | 🟡 Скоро (≤7 дней) | 🟢 Позже`;
        
        const paymentsMessage = await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            message_thread_id: messageThreadId
        });
        
        setTimeout(async () => {
            await deleteMessage(chatId, paymentsMessage.message_id);
        }, 30000);
        
    } catch (error) {
        console.error('❌ Ошибка при получении платежей:', error);
        const errorMessage = await bot.sendMessage(chatId, '❌ Ошибка при загрузке данных о платежах', {
            message_thread_id: messageThreadId
        });
        
        setTimeout(async () => {
            await deleteMessage(chatId, errorMessage.message_id);
        }, 5000);
    }
});

// Команда /help - справка
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const messageThreadId = msg.message_thread_id;
    
    await deleteMessage(chatId, msg.message_id);
    
    const helpText = `🤖 *Бот расчёта оплат*

📝 *Команды:*
/sale - начать расчёт новой продажи
/pay - посмотреть предстоящие платежи
/cancel - отменить текущий расчёт
/help - показать эту справку

💰 *Тарифы комиссий:*
• Стартовый набор - 7%
• Расширение - 8%
• Масштаб - 10%
• Абсолют - 12%

📅 *Уведомления:*
• За 3 дня до платежа
• В день платежа
• Автоматически в чат

Просто введите /sale и следуйте инструкциям!`;
    
    const helpMessage = await bot.sendMessage(chatId, helpText, { 
        parse_mode: 'Markdown',
        message_thread_id: messageThreadId
    });
    
    setTimeout(async () => {
        await deleteMessage(chatId, helpMessage.message_id);
    }, 15000);
});

// Команда /cancel - отмена текущего расчёта
bot.onText(/\/cancel/, async (msg) => {
    const chatId = msg.chat.id;
    const messageThreadId = msg.message_thread_id;
    const sessionKey = `${chatId}_${messageThreadId || 'main'}`;
    
    await deleteMessage(chatId, msg.message_id);
    
    if (userSessions[sessionKey]) {
        if (userSessions[sessionKey].messagesToDelete) {
            for (const messageId of userSessions[sessionKey].messagesToDelete) {
                await deleteMessage(chatId, messageId);
            }
        }
        
        delete userSessions[sessionKey];
        console.log(`❌ Сессия ${sessionKey} отменена`);
        
        const cancelMessage = await bot.sendMessage(chatId, '❌ Расчёт отменён.\n\nДля нового расчёта введите /sale', {
            message_thread_id: messageThreadId
        });
        
        setTimeout(async () => {
            await deleteMessage(chatId, cancelMessage.message_id);
        }, 3000);
    } else {
        const noSessionMessage = await bot.sendMessage(chatId, 'Нет активного расчёта для отмены.\n\nДля начала расчёта введите /sale', {
            message_thread_id: messageThreadId
        });
        
        setTimeout(async () => {
            await deleteMessage(chatId, noSessionMessage.message_id);
        }, 3000);
    }
});

// Дополнительные обработчики callback для траншей
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const messageThreadId = message.message_thread_id;
    const data = callbackQuery.data;
    const sessionKey = `${chatId}_${messageThreadId || 'main'}`;
    
    if (!userSessions[sessionKey] && data !== 'new_calculation') {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Сессия истекла. Начните заново с /sale' });
        return;
    }
    
    const session = userSessions[sessionKey];
    
    // Обработка управления траншами
    if (session && session.step === 'remainderPayments') {
        if (data === 'add_tranches') {
            session.step = 'tranches_count';
            await bot.editMessageText(
                `💰 Остаток: ${formatAmount(session.data.remainingAmount)}\n\nСколько будет траншей? Введите число:`,
                {
                    chat_id: chatId,
                    message_id: message.message_id,
                    message_thread_id: session.messageThreadId
                }
            );
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Указываем количество траншей' });
        } else if (data === 'skip_tranches') {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Указываем общий остаток' });
            await finalizeSale(sessionKey, session);
        } else if (data === 'finish_tranches') {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Завершаем' });
            await finalizeSale(sessionKey, session);
        }
        return;
    }
});

// Система уведомлений о платежах
async function checkAndSendNotifications() {
    try {
        const upcomingPayments = await getUpcomingPayments();
        
        for (const payment of upcomingPayments) {
            const daysUntil = payment.daysUntil;
            
            // Уведомления за 3 дня и в день платежа
            if (daysUntil === 3 || daysUntil === 0) {
                const notificationText = daysUntil === 3 
                    ? `⏰ *Напоминание о платеже через 3 дня*

🙋‍♀️ Клиент: *${payment.clientName}*
👤 Мастер: ${payment.masterName}
📦 Пакет: ${payment.packageType}
💰 Сумма: ${formatAmount(payment.amount)}
📅 Дата: ${payment.dueDateStr}

💡 Самое время напомнить клиенту об оплате!`
                    : `🔔 *Платёж сегодня!*

🙋‍♀️ Клиент: *${payment.clientName}*
👤 Мастер: ${payment.masterName}
📦 Пакет: ${payment.packageType}
💰 Сумма: ${formatAmount(payment.amount)}
📅 Дата: ${payment.dueDateStr}

🚨 Срочно свяжитесь с клиентом!`;
                
                await bot.sendMessage(payment.chatId, notificationText, {
                    parse_mode: 'Markdown',
                    message_thread_id: payment.messageThreadId
                });
                
                console.log(`🔔 Отправлено уведомление о платеже: ${payment.clientName} (${daysUntil === 0 ? 'сегодня' : 'через 3 дня'})`);
            }
        }
    } catch (error) {
        console.error('❌ Ошибка при отправке уведомлений:', error);
    }
}

console.log('🤖 Бот запущен! Ожидаю команды...');
console.log('🔔 Система уведомлений активирована');

// Запускаем проверку уведомлений каждые 12 часов
setInterval(checkAndSendNotifications, 12 * 60 * 60 * 1000);

// Проверяем уведомления при запуске бота
setTimeout(checkAndSendNotifications, 5000);

// Обработка ошибок
bot.on('error', (error) => {
    console.log('❌ Ошибка бота:', error.message);
});

bot.on('polling_error', (error) => {
    console.log('❌ Ошибка polling:', error.message);
});

// Graceful shutdown для облачного деплоя
process.on('SIGINT', () => {
    console.log('🛑 Получен сигнал SIGINT, останавливаем бота...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Получен сигнал SIGTERM, останавливаем бота...');
    bot.stopPolling();
    process.exit(0);
});
