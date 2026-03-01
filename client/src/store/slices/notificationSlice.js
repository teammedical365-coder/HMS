import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { notificationAPI } from '../../utils/api';

export const fetchNotifications = createAsyncThunk(
    'notifications/fetchAll',
    async (_, { rejectWithValue }) => {
        try {
            const response = await notificationAPI.getNotifications();
            if (response.success) return response.data;
            return rejectWithValue('Failed to load notifications');
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Error fetching notifications');
        }
    }
);

export const markAsRead = createAsyncThunk(
    'notifications/markAsRead',
    async (id, { rejectWithValue }) => {
        try {
            const response = await notificationAPI.markAsRead(id);
            if (response.success) return id;
            return rejectWithValue('Failed to mark read');
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Error marking read');
        }
    }
);

export const markAllAsRead = createAsyncThunk(
    'notifications/markAllAsRead',
    async (_, { rejectWithValue }) => {
        try {
            const response = await notificationAPI.markAllAsRead();
            if (response.success) return true;
            return rejectWithValue('Failed to mark all read');
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Error marking all read');
        }
    }
);

const notificationSlice = createSlice({
    name: 'notifications',
    initialState: {
        items: [],
        unreadCount: 0,
        loading: false,
        error: null
    },
    reducers: {
        addNotification: (state, action) => {
            state.items.unshift(action.payload);
            if (action.payload.status === 'Unread') {
                state.unreadCount += 1;
            }
        },
        removeNotification: (state, action) => {
            const index = state.items.findIndex(n => n._id === action.payload);
            if (index !== -1) {
                if (state.items[index].status === 'Unread') {
                    state.unreadCount = Math.max(0, state.unreadCount - 1);
                }
                state.items.splice(index, 1);
            }
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchNotifications.pending, (state) => { state.loading = true; })
            .addCase(fetchNotifications.fulfilled, (state, action) => {
                state.loading = false;
                state.items = action.payload;
                state.unreadCount = action.payload.filter(n => n.status === 'Unread').length;
            })
            .addCase(fetchNotifications.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Mark Single
            .addCase(markAsRead.fulfilled, (state, action) => {
                const item = state.items.find(n => n._id === action.payload);
                if (item && item.status === 'Unread') {
                    item.status = 'Read';
                    state.unreadCount = Math.max(0, state.unreadCount - 1);
                }
            })
            // Mark All
            .addCase(markAllAsRead.fulfilled, (state) => {
                state.items.forEach(n => n.status = 'Read');
                state.unreadCount = 0;
            });
    }
});

export const { addNotification, removeNotification } = notificationSlice.actions;
export default notificationSlice.reducer;
