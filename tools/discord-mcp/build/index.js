#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const discord_js_1 = require("discord.js");
class DiscordMCPServer {
    server;
    discordClient;
    constructor() {
        this.server = new index_js_1.Server({
            name: 'discord-mcp-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.discordClient = new discord_js_1.Client({
            intents: [
                discord_js_1.GatewayIntentBits.Guilds,
                discord_js_1.GatewayIntentBits.GuildMessages,
                discord_js_1.GatewayIntentBits.MessageContent,
            ],
        });
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    setupErrorHandling() {
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            await this.discordClient.destroy();
            process.exit(0);
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'discord_send_message',
                        description: 'Send a text message to a Discord channel',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                channel_id: {
                                    type: 'string',
                                    description: 'Discord channel ID',
                                },
                                message: {
                                    type: 'string',
                                    description: 'Message content to send',
                                },
                            },
                            required: ['channel_id', 'message'],
                        },
                    },
                    {
                        name: 'discord_send_file',
                        description: 'Send any type of file to a Discord channel (images, videos, audio, documents, etc.)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                channel_id: {
                                    type: 'string',
                                    description: 'Discord channel ID',
                                },
                                file_path: {
                                    type: 'string',
                                    description: 'Local path to the file',
                                },
                                message: {
                                    type: 'string',
                                    description: 'Optional message to accompany the file',
                                },
                                filename: {
                                    type: 'string',
                                    description: 'Optional custom filename for the attachment (if not provided, uses the original filename)',
                                },
                                spoiler: {
                                    type: 'boolean',
                                    description: 'Mark the file as spoiler (default: false)',
                                },
                            },
                            required: ['channel_id', 'file_path'],
                        },
                    },
                    {
                        name: 'discord_get_messages',
                        description: 'Retrieve messages from a Discord channel',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                channel_id: {
                                    type: 'string',
                                    description: 'Discord channel ID',
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Number of messages to retrieve (default: 10, max: 100)',
                                    minimum: 1,
                                    maximum: 100,
                                },
                            },
                            required: ['channel_id'],
                        },
                    },
                    {
                        name: 'discord_get_attachments',
                        description: 'Retrieve all types of media attachments from a Discord channel (images, videos, audio, documents, etc.)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                channel_id: {
                                    type: 'string',
                                    description: 'Discord channel ID',
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Number of messages to search for attachments (default: 50, max: 100)',
                                    minimum: 1,
                                    maximum: 100,
                                },
                                content_type_filter: {
                                    type: 'string',
                                    description: 'Filter by content type prefix (e.g., "image/", "video/", "audio/", "application/"). Leave empty for all types',
                                },
                            },
                            required: ['channel_id'],
                        },
                    },
                    {
                        name: 'discord_get_messages_advanced',
                        description: 'Advanced message retrieval with date range, keyword search, and pagination',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                channel_id: {
                                    type: 'string',
                                    description: 'Discord channel ID',
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Number of messages per page (default: 50, max: 100)',
                                    minimum: 1,
                                    maximum: 100,
                                },
                                before: {
                                    type: 'string',
                                    description: 'Get messages before this message ID (for pagination)',
                                },
                                after: {
                                    type: 'string',
                                    description: 'Get messages after this message ID (for pagination)',
                                },
                                start_date: {
                                    type: 'string',
                                    description: 'Start date in ISO format (e.g., 2024-01-01T00:00:00Z)',
                                },
                                end_date: {
                                    type: 'string',
                                    description: 'End date in ISO format (e.g., 2024-12-31T23:59:59Z)',
                                },
                                keyword: {
                                    type: 'string',
                                    description: 'Keyword to search in message content',
                                },
                                author: {
                                    type: 'string',
                                    description: 'Filter by author username or ID',
                                },
                                has_attachments: {
                                    type: 'boolean',
                                    description: 'Only get messages with attachments',
                                },
                            },
                            required: ['channel_id'],
                        },
                    },
                ],
            };
        });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            try {
                const { name, arguments: args } = request.params;
                if (!args) {
                    throw new Error('Arguments are required');
                }
                switch (name) {
                    case 'discord_send_message':
                        return await this.sendMessage(args.channel_id, args.message);
                    case 'discord_send_file':
                        return await this.sendFile(args.channel_id, args.file_path, args.message, args.filename, args.spoiler);
                    case 'discord_get_messages':
                        return await this.getMessages(args.channel_id, args.limit || 10);
                    case 'discord_get_attachments':
                        return await this.getAttachments(args.channel_id, args.limit || 50, args.content_type_filter);
                    case 'discord_get_messages_advanced':
                        return await this.getMessagesAdvanced({
                            channelId: args.channel_id,
                            limit: args.limit || 50,
                            before: args.before,
                            after: args.after,
                            startDate: args.start_date,
                            endDate: args.end_date,
                            keyword: args.keyword,
                            author: args.author,
                            hasAttachments: args.has_attachments,
                        });
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        });
    }
    async sendMessage(channelId, message) {
        await this.ensureDiscordReady();
        const channel = await this.discordClient.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Channel not found or is not a text channel');
        }
        const sentMessage = await channel.send(message);
        return {
            content: [
                {
                    type: 'text',
                    text: `Message sent successfully to channel ${channelId}. Message ID: ${sentMessage.id}`,
                },
            ],
        };
    }
    async sendFile(channelId, filePath, message, customFilename, spoiler) {
        await this.ensureDiscordReady();
        const channel = await this.discordClient.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Channel not found or is not a text channel');
        }
        try {
            const attachmentOptions = { attachment: filePath };
            if (customFilename) {
                attachmentOptions.name = customFilename;
            }
            if (spoiler) {
                attachmentOptions.spoiler = true;
            }
            const attachment = new discord_js_1.AttachmentBuilder(attachmentOptions.attachment, attachmentOptions);
            const sentMessage = await channel.send({
                content: message || '',
                files: [attachment],
            });
            const fileType = this.getFileType(filePath);
            return {
                content: [
                    {
                        type: 'text',
                        text: `${fileType} file sent successfully to channel ${channelId}. Message ID: ${sentMessage.id}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to send file: ${error}`);
        }
    }
    getFileType(filePath) {
        const extension = filePath.toLowerCase().split('.').pop();
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
        const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
        const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];
        const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
        const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz'];
        if (imageExtensions.includes(extension || ''))
            return 'Image';
        if (videoExtensions.includes(extension || ''))
            return 'Video';
        if (audioExtensions.includes(extension || ''))
            return 'Audio';
        if (documentExtensions.includes(extension || ''))
            return 'Document';
        if (archiveExtensions.includes(extension || ''))
            return 'Archive';
        return 'File';
    }
    async getMessages(channelId, limit) {
        await this.ensureDiscordReady();
        const channel = await this.discordClient.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Channel not found or is not a text channel');
        }
        const messages = await channel.messages.fetch({ limit });
        const messageData = messages.map(msg => ({
            id: msg.id,
            author: msg.author.username,
            content: msg.content,
            timestamp: msg.createdAt.toISOString(),
            attachments: msg.attachments.map(att => ({
                name: att.name,
                url: att.url,
                size: att.size,
            })),
        }));
        return {
            content: [
                {
                    type: 'text',
                    text: `Retrieved ${messageData.length} messages from channel ${channelId}:\n\n${JSON.stringify(messageData, null, 2)}`,
                },
            ],
        };
    }
    async getAttachments(channelId, limit, contentTypeFilter) {
        await this.ensureDiscordReady();
        const channel = await this.discordClient.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Channel not found or is not a text channel');
        }
        const messages = await channel.messages.fetch({ limit });
        const attachmentData = [];
        messages.forEach(msg => {
            msg.attachments.forEach(attachment => {
                const shouldInclude = !contentTypeFilter ||
                    (attachment.contentType?.startsWith(contentTypeFilter)) ||
                    (!attachment.contentType && contentTypeFilter === 'unknown');
                if (shouldInclude) {
                    attachmentData.push({
                        messageId: msg.id,
                        author: msg.author.username,
                        timestamp: msg.createdAt.toISOString(),
                        filename: attachment.name,
                        url: attachment.url,
                        size: attachment.size,
                        contentType: attachment.contentType || 'unknown',
                        description: attachment.description,
                        width: attachment.width,
                        height: attachment.height,
                    });
                }
            });
        });
        const filterText = contentTypeFilter ? ` (filtered by: ${contentTypeFilter})` : '';
        return {
            content: [
                {
                    type: 'text',
                    text: `Retrieved ${attachmentData.length} attachments from channel ${channelId}${filterText}:\n\n${JSON.stringify(attachmentData, null, 2)}`,
                },
            ],
        };
    }
    async getMessagesAdvanced(params) {
        await this.ensureDiscordReady();
        const channel = await this.discordClient.channels.fetch(params.channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Channel not found or is not a text channel');
        }
        const textChannel = channel;
        let allMessages = [];
        let lastMessageId = params.before;
        const targetLimit = params.limit || 50;
        let totalFetched = 0;
        const maxIterations = 10; // Prevent infinite loops
        let iterations = 0;
        // Parse dates if provided
        const startDate = params.startDate ? new Date(params.startDate) : null;
        const endDate = params.endDate ? new Date(params.endDate) : null;
        while (allMessages.length < targetLimit && iterations < maxIterations) {
            iterations++;
            // Fetch messages with pagination
            const fetchOptions = { limit: 100 };
            if (lastMessageId)
                fetchOptions.before = lastMessageId;
            if (params.after)
                fetchOptions.after = params.after;
            const fetchResult = await textChannel.messages.fetch(fetchOptions);
            // Check if fetch returned a single message or a collection
            const messages = fetchResult instanceof discord_js_1.Message ?
                new discord_js_1.Collection([[fetchResult.id, fetchResult]]) :
                fetchResult;
            if (messages.size === 0)
                break;
            // Convert to array and sort by timestamp (newest first)
            const messageArray = Array.from(messages.values());
            messageArray.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            for (const msg of messageArray) {
                // Date range filter
                if (startDate && msg.createdAt < startDate) {
                    // If we've gone before the start date, stop fetching
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Retrieved ${allMessages.length} messages matching criteria:\n\n${JSON.stringify(allMessages, null, 2)}`,
                            },
                        ],
                    };
                }
                if (endDate && msg.createdAt > endDate) {
                    continue; // Skip messages after end date
                }
                // Keyword filter
                if (params.keyword && !msg.content.toLowerCase().includes(params.keyword.toLowerCase())) {
                    continue;
                }
                // Author filter
                if (params.author) {
                    const authorMatch = msg.author.username === params.author ||
                        msg.author.id === params.author;
                    if (!authorMatch)
                        continue;
                }
                // Attachment filter
                if (params.hasAttachments && msg.attachments.size === 0) {
                    continue;
                }
                // Add message to results
                allMessages.push({
                    id: msg.id,
                    author: msg.author.username,
                    authorId: msg.author.id,
                    content: msg.content,
                    timestamp: msg.createdAt.toISOString(),
                    attachments: msg.attachments.map(att => ({
                        name: att.name,
                        url: att.url,
                        size: att.size,
                        contentType: att.contentType,
                    })),
                    embeds: msg.embeds.length,
                    reactions: msg.reactions.cache.size,
                });
                if (allMessages.length >= targetLimit)
                    break;
            }
            // Update last message ID for next iteration
            const lastMessage = messageArray[messageArray.length - 1];
            if (lastMessage) {
                lastMessageId = lastMessage.id;
            }
            totalFetched += messages.size;
            // If we've fetched fewer messages than requested, we've reached the end
            if (messages.size < 100)
                break;
        }
        // Prepare summary
        const summary = {
            total: allMessages.length,
            filters: {
                dateRange: startDate || endDate ?
                    `${startDate ? startDate.toISOString() : 'any'} to ${endDate ? endDate.toISOString() : 'any'}` :
                    'none',
                keyword: params.keyword || 'none',
                author: params.author || 'any',
                hasAttachments: params.hasAttachments || false,
            },
            pagination: {
                before: params.before || 'none',
                after: params.after || 'none',
                totalFetched: totalFetched,
            },
        };
        return {
            content: [
                {
                    type: 'text',
                    text: `Advanced search results:\n\nSummary: ${JSON.stringify(summary, null, 2)}\n\nMessages:\n${JSON.stringify(allMessages, null, 2)}`,
                },
            ],
        };
    }
    async ensureDiscordReady() {
        if (this.discordClient.isReady()) {
            return;
        }
        const token = process.env.DISCORD_BOT_TOKEN;
        if (!token) {
            throw new Error('DISCORD_BOT_TOKEN environment variable is required');
        }
        await this.discordClient.login(token);
        console.error('Discord client logged in successfully');
    }
    async start() {
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.error('Discord MCP server started');
    }
}
if (require.main === module) {
    const server = new DiscordMCPServer();
    server.start().catch(console.error);
}
exports.default = DiscordMCPServer;
//# sourceMappingURL=index.js.map