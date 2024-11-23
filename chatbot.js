class ChatbotManager {
    constructor() {
        this.currentBot = 'grammar';
        this.messageHistory = {};
        this.initializeEventListeners();
        this.initializeChatbots();
    }

    initializeEventListeners() {
        // Initialize UI elements
        this.chatMessages = document.getElementById('chatMessages');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');

        // Bot selector buttons
        document.querySelectorAll('.bot-selector').forEach(button => {
            button.addEventListener('click', () => {
                this.switchBot(button.dataset.bot);
                document.querySelectorAll('.bot-selector').forEach(btn => 
                    btn.classList.remove('active'));
                button.classList.add('active');
            });
        });

        // Send message event listeners
        this.sendButton.addEventListener('click', () => this.handleUserInput());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleUserInput();
            }
        });

        // Auto-resize textarea
        this.userInput.addEventListener('input', () => {
            this.userInput.style.height = 'auto';
            this.userInput.style.height = Math.min(this.userInput.scrollHeight, 150) + 'px';
        });
    }

    initializeChatbots() {
        // Initialize message history for each bot
        Object.keys(CONFIG.CHATBOTS).forEach(botType => {
            this.messageHistory[botType] = [];
        });

        // Show welcome message for default bot
        this.addMessage(CONFIG.CHATBOTS[this.currentBot].welcomeMessage, 'bot');
    }

    switchBot(botType) {
        if (!CONFIG.CHATBOTS[botType]) return;
        
        this.currentBot = botType;
        this.chatMessages.innerHTML = '';
        
        // Show chat history or welcome message
        if (this.messageHistory[botType].length) {
            this.messageHistory[botType].forEach(msg => {
                this.addMessage(msg.content, msg.role === 'user' ? 'user' : 'bot');
            });
        } else {
            this.addMessage(CONFIG.CHATBOTS[botType].welcomeMessage, 'bot');
        }
    }

    async handleUserInput() {
        const message = this.userInput.value.trim();
        if (!message) return;

        // Clear input and reset height
        this.userInput.value = '';
        this.userInput.style.height = 'auto';

        // Add user message to chat
        this.addMessage(message, 'user');
        this.messageHistory[this.currentBot].push({
            role: 'user',
            content: message
        });

        // Disable input while processing
        this.setInputState(false);
        this.showTypingIndicator();

        try {
            const response = await this.getGroqResponse(message);
            this.removeTypingIndicator();
            this.addMessage(response, 'bot');
            
            this.messageHistory[this.currentBot].push({
                role: 'assistant',
                content: response
            });

            // Limit history to last 10 messages to prevent token limit issues
            if (this.messageHistory[this.currentBot].length > 20) {
                this.messageHistory[this.currentBot] = this.messageHistory[this.currentBot].slice(-20);
            }
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessage(this.getErrorMessage(error), 'bot');
            console.error('Error:', error);
        } finally {
            this.setInputState(true);
        }
    }

    async getGroqResponse(message) {
        if (!CONFIG.GROQ_API_KEY || CONFIG.GROQ_API_KEY === 'YOUR_GROQ_API_KEY') {
            throw new Error(ERRORS.API_KEY_MISSING);
        }

        const messages = [
            {
                role: 'system',
                content: CONFIG.CHATBOTS[this.currentBot].systemPrompt
            },
            ...this.messageHistory[this.currentBot].slice(-10),
            {
                role: 'user',
                content: message
            }
        ];

        try {
            const response = await fetch(CONFIG.GROQ_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: CONFIG.MODEL,
                    messages: messages,
                    temperature: CONFIG.TEMPERATURE,
                    max_tokens: CONFIG.MAX_TOKENS
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || ERRORS.API_ERROR);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    addMessage(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        // Process markdown-style code blocks
        let formattedMessage = message.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, language, code) => {
            return `<pre><code class="language-${language}">${this.escapeHtml(code.trim())}</code></pre>`;
        });

        // Process inline code
        formattedMessage = formattedMessage.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Convert URLs to clickable links
        formattedMessage = formattedMessage.replace(
            /(https?:\/\/[^\s<]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        // Convert line breaks to <br> tags
        formattedMessage = formattedMessage.replace(/\n/g, '<br>');

        messageDiv.innerHTML = formattedMessage;
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'message bot-message typing-indicator';
        indicator.innerHTML = '<span></span><span></span><span></span>';
        indicator.id = 'typingIndicator';
        this.chatMessages.appendChild(indicator);
        this.scrollToBottom();
    }

    removeTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    setInputState(enabled) {
        this.userInput.disabled = !enabled;
        this.sendButton.disabled = !enabled;
    }

    getErrorMessage(error) {
        if (error.message.includes('API key')) {
            return ERRORS.API_KEY_MISSING;
        } else if (error.message.includes('rate limit')) {
            return ERRORS.RATE_LIMIT;
        } else if (error.message.includes('network')) {
            return ERRORS.NETWORK_ERROR;
        }
        return ERRORS.API_ERROR;
    }
}

// Initialize the chatbot manager when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ChatbotManager();
});
