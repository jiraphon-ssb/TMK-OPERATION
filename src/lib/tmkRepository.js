import { isSupabaseConfigured, supabase } from './supabaseClient';

const TABLES = {
  campaigns: 'tmk_campaigns',
  channels: 'tmk_channels',
  products: 'tmk_products',
  tasks: 'tmk_tasks',
  checklist: 'tmk_task_checklist',
  comments: 'tmk_task_comments',
  attachments: 'tmk_task_attachments',
  purchaseOrders: 'tmk_purchase_orders',
  settings: 'tmk_settings'
};

const normalizeProduct = (product) => ({
  ...product,
  stockOnHand: Number(product.stockOnHand ?? product.stock_on_hand ?? 0),
  reservedUnits: Number(product.reservedUnits ?? product.reserved_units ?? 0),
  reorderPoint: Number(product.reorderPoint ?? product.reorder_point ?? 0)
});

const mapProductToDb = (product) => ({
  id: product.id,
  name: product.name,
  price: Number(product.price || 0),
  target_units: Number(product.targetUnits || 0),
  actual_units: Number(product.actualUnits || 0),
  stock_on_hand: Number(product.stockOnHand || 0),
  reserved_units: Number(product.reservedUnits || 0),
  reorder_point: Number(product.reorderPoint || 0),
  strategy: product.strategy || ''
});

const mapProductFromDb = (product) => ({
  id: product.id,
  name: product.name,
  price: Number(product.price || 0),
  targetUnits: Number(product.target_units || 0),
  actualUnits: Number(product.actual_units || 0),
  stockOnHand: Number(product.stock_on_hand || 0),
  reservedUnits: Number(product.reserved_units || 0),
  reorderPoint: Number(product.reorder_point || 0),
  strategy: product.strategy || ''
});

const mapTaskToDb = (task) => ({
  id: task.id,
  date: task.date,
  camp: task.camp || null,
  title: task.title,
  detail: task.detail || '',
  responsible: task.responsible || '',
  channel: task.channel || '',
  status: task.status || 'todo',
  priority: task.priority || 'medium',
  reminder_days: Number(task.reminderDays || 1)
});

const mapTaskFromDb = (task, checklistByTask, commentsByTask, attachmentsByTask) => ({
  id: task.id,
  date: task.date,
  camp: task.camp,
  title: task.title,
  detail: task.detail || '',
  responsible: task.responsible || '',
  channel: task.channel || '',
  status: task.status || 'todo',
  priority: task.priority || 'medium',
  checklist: checklistByTask[task.id] || [],
  comments: commentsByTask[task.id] || [],
  attachments: attachmentsByTask[task.id] || [],
  reminderDays: Number(task.reminder_days || 1)
});

const mapPoToDb = (po) => ({
  id: po.id,
  product: po.product,
  quantity: Number(po.quantity || 0),
  order_date: po.orderDate,
  arrival_date: po.arrivalDate,
  status: po.status || 'Pending'
});

const mapPoFromDb = (po) => ({
  id: po.id,
  product: po.product,
  quantity: Number(po.quantity || 0),
  orderDate: po.order_date,
  arrivalDate: po.arrival_date,
  status: po.status || 'Pending'
});

const groupByTask = (rows, mapper) => rows.reduce((acc, row) => {
  const taskId = row.task_id;
  acc[taskId] = acc[taskId] || [];
  acc[taskId].push(mapper(row));
  return acc;
}, {});

const replaceTable = async (table, rows) => {
  if (!rows) {
    console.warn(`⚠️ Skipped replace for ${table}: rows is null/undefined`);
    return;
  }

  // Empty incoming set: delete ALL rows from the table
  if (rows.length === 0) {
    console.log(`🗑️ Deleting ALL rows from ${table} (empty incoming set)`);
    const { data: deletedRows, error: deleteError } = await supabase
      .from(table)
      .delete()
      .not('id', 'is', null)
      .select('id');
    if (deleteError) throw deleteError;
    if (deletedRows && deletedRows.length > 0) {
      console.warn(`🗑️ ${table}: deleted ALL ${deletedRows.length} rows`);
    }
    return;
  }

  // Safety: log what we're about to save
  console.log(`💾 Saving ${table}: ${rows.length} rows`, rows.map(r => r.id || r.name || '?'));

  // 1. Upsert to insert new rows or update existing ones
  const { error: upsertError } = await supabase.from(table).upsert(rows);
  if (upsertError) throw upsertError;

  // 2. Safely delete only the rows that are not in the new set
  const incomingIds = rows.map(r => r.id).filter(Boolean);
  if (incomingIds.length > 0) {
    const { data: deletedRows, error: deleteError } = await supabase.from(table).delete().not('id', 'in', incomingIds).select('id');
    if (deleteError) throw deleteError;
    if (deletedRows && deletedRows.length > 0) {
      console.warn(`🗑️ ${table}: deleted ${deletedRows.length} rows not in incoming set:`, deletedRows.map(r => r.id));
    }
  }
};

const replaceTaskChildren = async (tasks) => {
  await replaceTable(TABLES.checklist, tasks.flatMap(task => (task.checklist || []).map((item, index) => ({
    id: item.id,
    task_id: task.id,
    text: item.text || '',
    completed: Boolean(item.completed),
    position: index
  }))));

  await replaceTable(TABLES.comments, tasks.flatMap(task => (task.comments || []).map(comment => ({
    id: comment.id,
    task_id: task.id,
    text: comment.text || '',
    author: comment.author || ''
  }))));

  await replaceTable(TABLES.attachments, tasks.flatMap(task => (task.attachments || []).map(attachment => ({
    id: attachment.id,
    task_id: task.id,
    label: attachment.label || attachment.url || '',
    url: attachment.url || ''
  })).filter(attachment => attachment.url)));
};

export const tmkRepository = {
  isConfigured: isSupabaseConfigured,

  async loadAll() {
    if (!isSupabaseConfigured) return null;

    const [campaigns, channels, products, tasks, checklist, comments, attachments, purchaseOrders, settings] = await Promise.all([
      supabase.from(TABLES.campaigns).select('*').order('created_at'),
      supabase.from(TABLES.channels).select('*').order('created_at'),
      supabase.from(TABLES.products).select('*').order('created_at'),
      supabase.from(TABLES.tasks).select('*').order('date'),
      supabase.from(TABLES.checklist).select('*').order('position'),
      supabase.from(TABLES.comments).select('*').order('created_at'),
      supabase.from(TABLES.attachments).select('*').order('created_at'),
      supabase.from(TABLES.purchaseOrders).select('*').order('arrival_date'),
      supabase.from(TABLES.settings).select('*').eq('id', 'main').maybeSingle()
    ]);

    const results = [campaigns, channels, products, tasks, checklist, comments, attachments, purchaseOrders, settings];
    const tableNames = ['campaigns', 'channels', 'products', 'tasks', 'checklist', 'comments', 'attachments', 'purchaseOrders', 'settings'];
    console.group('📊 TMK Supabase loadAll() results');
    results.forEach((result, i) => {
      const name = tableNames[i];
      if (result.error) {
        console.error(`  ❌ ${name}: ERROR`, result.error.message, result.error);
      } else if (name === 'settings') {
        console.log(`  ✅ ${name}:`, result.data ? JSON.stringify(result.data) : 'null (no settings row)');
      } else {
        console.log(`  ✅ ${name}: ${(result.data || []).length} rows`);
      }
    });
    console.groupEnd();
    const failed = results.find(result => result.error);
    if (failed) throw failed.error;

    const checklistByTask = groupByTask(checklist.data || [], item => ({
      id: item.id,
      text: item.text,
      completed: Boolean(item.completed)
    }));
    const commentsByTask = groupByTask(comments.data || [], comment => ({
      id: comment.id,
      text: comment.text,
      author: comment.author || ''
    }));
    const attachmentsByTask = groupByTask(attachments.data || [], attachment => ({
      id: attachment.id,
      label: attachment.label || attachment.url,
      url: attachment.url
    }));

    return {
      campaigns: campaigns.data || [],
      channels: (channels.data || []).map(ch => ({
        id: ch.id,
        name: ch.name,
        target: Number(ch.percentage ?? 0),
        actual: Number(ch.actual ?? 0),
        color: ch.color || '#3b82f6'
      })),
      products: (products.data || []).map(mapProductFromDb),
      tasks: (tasks.data || []).map(task => mapTaskFromDb(task, checklistByTask, commentsByTask, attachmentsByTask)),
      poTracker: (purchaseOrders.data || []).map(mapPoFromDb),
      totalTarget: Number(settings.data?.total_target || 0),
      totalUnitsTarget: Number(settings.data?.total_units_target || 0)
    };
  },

  async saveCampaigns(campaigns) {
    if (!isSupabaseConfigured) return;
    await replaceTable(TABLES.campaigns, campaigns);
  },

  async saveChannels(channels) {
    if (!isSupabaseConfigured) return;
    const dbChannels = channels.map(ch => ({
      id: ch.id,
      name: ch.name,
      percentage: Number(ch.target || 0),
      actual: Number(ch.actual || 0),
      color: ch.color
    }));
    await replaceTable(TABLES.channels, dbChannels);
  },

  async saveProducts(products) {
    if (!isSupabaseConfigured) return;
    await replaceTable(TABLES.products, products.map(normalizeProduct).map(mapProductToDb));
  },

  async saveTasks(tasks) {
    if (!isSupabaseConfigured) return;
    // 1. Save/delete children first (checklist, comments, attachments)
    //    This avoids FK constraint errors when removing parent tasks.
    await replaceTaskChildren(tasks);
    // 2. Then replace the tasks table (upsert remaining + delete removed)
    await replaceTable(TABLES.tasks, tasks.map(mapTaskToDb));
  },

  async deleteTaskById(taskId) {
    if (!isSupabaseConfigured) return;
    const { error: err1 } = await supabase.from(TABLES.checklist).delete().eq('task_id', taskId);
    if (err1) throw err1;
    const { error: err2 } = await supabase.from(TABLES.comments).delete().eq('task_id', taskId);
    if (err2) throw err2;
    const { error: err3 } = await supabase.from(TABLES.attachments).delete().eq('task_id', taskId);
    if (err3) throw err3;
    const { error: err4 } = await supabase.from(TABLES.tasks).delete().eq('id', taskId);
    if (err4) throw err4;
  },

  async savePurchaseOrders(poTracker) {
    if (!isSupabaseConfigured) return;
    await replaceTable(TABLES.purchaseOrders, poTracker.map(mapPoToDb));
  },

  async saveSettings({ totalTarget, totalUnitsTarget }) {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from(TABLES.settings).upsert({
      id: 'main',
      total_target: Number(totalTarget || 0),
      total_units_target: Number(totalUnitsTarget || 0),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  },

  subscribeToChanges(onChange) {
    if (!isSupabaseConfigured) return () => {};
    let timer = null;
    const channel = supabase.channel('tmk-realtime-sync');
    Object.values(TABLES).forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 250);
      });
    });
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }
};
