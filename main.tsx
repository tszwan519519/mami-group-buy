import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileCode2,
  KeyRound,
  Link2,
  LockKeyhole,
  LogIn,
  LogOut,
  Minus,
  MousePointerClick,
  Package,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Share2,
  ShoppingBasket,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { CAMPAIGNS as DEFAULT_CAMPAIGNS, type CampaignItem, type CampaignPreset } from "./data/campaigns";
import { getSupabaseClient, isSupabaseConfigured } from "./lib/supabase";

type AppView = "join" | "admin" | "setup";

type OrderLineItem = {
  itemId: string;
  itemName: string;
  price: number;
  quantity: number;
  subtotal: number;
};

type OrderEntry = {
  id: string;
  campaignId: string;
  campaignName: string;
  momName: string;
  contact: string;
  notes: string;
  lineItems: OrderLineItem[];
  totalAmount: number;
  createdAt: string;
};

type OrganizerSummary = {
  key: string;
  momName: string;
  contact: string;
  campaigns: string[];
  totalOrders: number;
  totalItems: number;
  totalAmount: number;
};

const LOCAL_ORDER_STORAGE_KEY = "mama-group-buy-demo-orders";
const LOCAL_CAMPAIGN_STORAGE_KEY = "mama-group-buy-demo-campaigns";
const ORGANIZER_SQL = `create extension if not exists pgcrypto;

create table if not exists public.group_campaigns (
  id text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.group_campaign_items (
  id text primary key,
  campaign_id text not null references public.group_campaigns(id) on delete cascade,
  name text not null,
  price numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.group_orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  campaign_name text not null,
  mom_name text not null,
  contact text not null,
  notes text not null default '',
  line_items jsonb not null,
  total_amount numeric not null,
  created_at timestamptz not null default now()
);

alter table public.group_campaigns enable row level security;
alter table public.group_campaign_items enable row level security;
alter table public.group_orders enable row level security;

drop policy if exists "public_can_read_campaigns" on public.group_campaigns;
create policy "public_can_read_campaigns"
on public.group_campaigns
for select
to anon, authenticated
using (true);

drop policy if exists "authenticated_can_write_campaigns" on public.group_campaigns;
create policy "authenticated_can_write_campaigns"
on public.group_campaigns
for all
to authenticated
using (true)
with check (true);

drop policy if exists "public_can_read_campaign_items" on public.group_campaign_items;
create policy "public_can_read_campaign_items"
on public.group_campaign_items
for select
to anon, authenticated
using (true);

drop policy if exists "authenticated_can_write_campaign_items" on public.group_campaign_items;
create policy "authenticated_can_write_campaign_items"
on public.group_campaign_items
for all
to authenticated
using (true)
with check (true);

drop policy if exists "public_can_insert_orders" on public.group_orders;
create policy "public_can_insert_orders"
on public.group_orders
for insert
to anon, authenticated
with check (true);

drop policy if exists "authenticated_can_read_orders" on public.group_orders;
create policy "authenticated_can_read_orders"
on public.group_orders
for select
to authenticated
using (true);`;

const supabase = getSupabaseClient();

function getInitialView(): AppView {
  if (typeof window === "undefined") {
    return "join";
  }

  const queryView = new URLSearchParams(window.location.search).get("view");

  if (queryView === "admin" || queryView === "setup") {
    return queryView;
  }

  return "join";
}

function normalizeCampaigns(campaigns: CampaignPreset[]) {
  return campaigns.map((campaign) => ({
    ...campaign,
    items: campaign.items.map((item) => ({
      ...item,
      price: Number(item.price) || 0,
    })),
  }));
}

function buildQuantityMap(campaigns: CampaignPreset[], campaignId: string) {
  const campaign = campaigns.find((item) => item.id === campaignId) ?? campaigns[0];

  if (!campaign) {
    return {};
  }

  return campaign.items.reduce<Record<string, number>>((result, item) => {
    result[item.id] = 0;
    return result;
  }, {});
}

function formatMoney(amount: number) {
  return `HK$${amount.toFixed(0)}`;
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString("zh-HK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneCampaign(campaign: CampaignPreset): CampaignPreset {
  return {
    ...campaign,
    items: campaign.items.map((item) => ({ ...item })),
  };
}

function createEmptyCampaign(id = createId()): CampaignPreset {
  return {
    id,
    name: "",
    description: "",
    items: [{ id: createId(), name: "", price: 0 }],
  };
}

function parseRemoteEntry(row: Record<string, unknown>): OrderEntry {
  const rawLineItems = row.line_items;
  const lineItems = Array.isArray(rawLineItems)
    ? rawLineItems.map((lineItem) => {
        const safeLineItem = lineItem as Record<string, unknown>;

        return {
          itemId: String(safeLineItem.itemId ?? ""),
          itemName: String(safeLineItem.itemName ?? ""),
          price: Number(safeLineItem.price ?? 0),
          quantity: Number(safeLineItem.quantity ?? 0),
          subtotal: Number(safeLineItem.subtotal ?? 0),
        } satisfies OrderLineItem;
      })
    : [];

  return {
    id: String(row.id ?? createId()),
    campaignId: String(row.campaign_id ?? ""),
    campaignName: String(row.campaign_name ?? ""),
    momName: String(row.mom_name ?? ""),
    contact: String(row.contact ?? ""),
    notes: String(row.notes ?? ""),
    lineItems,
    totalAmount: Number(row.total_amount ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function parseRemoteCampaigns(
  campaignRows: Array<Record<string, unknown>>,
  itemRows: Array<Record<string, unknown>>,
) {
  return campaignRows.map((campaignRow) => ({
    id: String(campaignRow.id ?? createId()),
    name: String(campaignRow.name ?? ""),
    description: String(campaignRow.description ?? ""),
    items: itemRows
      .filter((itemRow) => String(itemRow.campaign_id ?? "") === String(campaignRow.id ?? ""))
      .map((itemRow) => ({
        id: String(itemRow.id ?? createId()),
        name: String(itemRow.name ?? ""),
        price: Number(itemRow.price ?? 0),
      })),
  }));
}

export default function App() {
  const [view, setView] = useState<AppView>(getInitialView);
  const [campaigns, setCampaigns] = useState<CampaignPreset[]>(DEFAULT_CAMPAIGNS);
  const [selectedCampaignId, setSelectedCampaignId] = useState(DEFAULT_CAMPAIGNS[0]?.id ?? "");
  const [editorCampaignId, setEditorCampaignId] = useState(DEFAULT_CAMPAIGNS[0]?.id ?? "");
  const [campaignDraft, setCampaignDraft] = useState<CampaignPreset>(
    cloneCampaign(DEFAULT_CAMPAIGNS[0] ?? createEmptyCampaign()),
  );
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    buildQuantityMap(DEFAULT_CAMPAIGNS, DEFAULT_CAMPAIGNS[0]?.id ?? ""),
  );
  const [momName, setMomName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [entries, setEntries] = useState<OrderEntry[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const onlineReady = isSupabaseConfigured;
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0];
  const hasCampaigns = campaigns.length > 0;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    window.history.replaceState({}, "", url);
  }, [view]);

  useEffect(() => {
    if (!hasCampaigns) {
      setSelectedCampaignId("");
      return;
    }

    if (!campaigns.some((campaign) => campaign.id === selectedCampaignId)) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, hasCampaigns, selectedCampaignId]);

  useEffect(() => {
    if (!hasCampaigns) {
      setEditorCampaignId("");
      setCampaignDraft(createEmptyCampaign());
      return;
    }

    if (!editorCampaignId) {
      setEditorCampaignId(campaigns[0].id);
      return;
    }

    const found = campaigns.find((campaign) => campaign.id === editorCampaignId);
    if (found) {
      setCampaignDraft(cloneCampaign(found));
    }
  }, [campaigns, editorCampaignId, hasCampaigns]);

  useEffect(() => {
    if (!selectedCampaign) {
      setQuantities({});
      return;
    }

    setQuantities(buildQuantityMap(campaigns, selectedCampaign.id));
  }, [campaigns, selectedCampaign]);

  useEffect(() => {
    if (!onlineReady || !supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onlineReady]);

  useEffect(() => {
    if (!onlineReady || !supabase) {
      if (typeof window === "undefined") {
        return;
      }

      const rawCampaigns = window.localStorage.getItem(LOCAL_CAMPAIGN_STORAGE_KEY);
      const parsedCampaigns = rawCampaigns
        ? normalizeCampaigns(JSON.parse(rawCampaigns) as CampaignPreset[])
        : DEFAULT_CAMPAIGNS;

      setCampaigns(parsedCampaigns.length > 0 ? parsedCampaigns : DEFAULT_CAMPAIGNS);

      const rawOrders = window.localStorage.getItem(LOCAL_ORDER_STORAGE_KEY);
      if (rawOrders) {
        try {
          setEntries(JSON.parse(rawOrders) as OrderEntry[]);
        } catch {
          setEntries([]);
        }
      }

      return;
    }

    const loadCampaigns = async () => {
      setIsLoadingCampaigns(true);

      const [{ data: campaignRows, error: campaignError }, { data: itemRows, error: itemError }] =
        await Promise.all([
          supabase.from("group_campaigns").select("id, name, description, sort_order").order("sort_order"),
          supabase
            .from("group_campaign_items")
            .select("id, campaign_id, name, price, sort_order")
            .order("sort_order"),
        ]);

      if (campaignError || itemError) {
        setFeedback(`讀取團購項目失敗: ${(campaignError ?? itemError)?.message}`);
        setCampaigns(DEFAULT_CAMPAIGNS);
        setIsLoadingCampaigns(false);
        return;
      }

      const remoteCampaigns = parseRemoteCampaigns(
        (campaignRows ?? []) as Array<Record<string, unknown>>,
        (itemRows ?? []) as Array<Record<string, unknown>>,
      );

      setCampaigns(remoteCampaigns.length > 0 ? remoteCampaigns : DEFAULT_CAMPAIGNS);
      setIsLoadingCampaigns(false);
    };

    void loadCampaigns();

    const channel = supabase
      .channel("group-campaigns-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "group_campaigns" }, loadCampaigns)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_campaign_items" }, loadCampaigns)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onlineReady]);

  useEffect(() => {
    if (!onlineReady || !supabase || !session) {
      if (onlineReady) {
        setEntries([]);
      }
      return;
    }

    const loadEntries = async () => {
      setIsLoadingEntries(true);

      const { data, error } = await supabase
        .from("group_orders")
        .select("id, campaign_id, campaign_name, mom_name, contact, notes, line_items, total_amount, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        setFeedback(`讀取雲端資料失敗: ${error.message}`);
        setIsLoadingEntries(false);
        return;
      }

      setEntries((data ?? []).map((row) => parseRemoteEntry(row as Record<string, unknown>)));
      setIsLoadingEntries(false);
    };

    void loadEntries();

    const channel = supabase
      .channel("group-orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "group_orders" }, loadEntries)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onlineReady, session]);

  useEffect(() => {
    if (typeof window === "undefined" || onlineReady) {
      return;
    }

    window.localStorage.setItem(LOCAL_ORDER_STORAGE_KEY, JSON.stringify(entries));
    window.localStorage.setItem(LOCAL_CAMPAIGN_STORAGE_KEY, JSON.stringify(campaigns));
  }, [campaigns, entries, onlineReady]);

  useEffect(() => {
    if (!feedback || typeof window === "undefined") {
      return;
    }

    const timer = window.setTimeout(() => {
      setFeedback(null);
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [feedback]);

  const selectedItems = useMemo(() => {
    if (!selectedCampaign) {
      return [];
    }

    return selectedCampaign.items
      .map((item) => ({
        itemId: item.id,
        itemName: item.name,
        price: item.price,
        quantity: quantities[item.id] ?? 0,
        subtotal: (quantities[item.id] ?? 0) * item.price,
      }))
      .filter((item) => item.quantity > 0);
  }, [quantities, selectedCampaign]);

  const formTotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.subtotal, 0),
    [selectedItems],
  );

  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) {
      return entries;
    }

    const keyword = searchTerm.toLowerCase();

    return entries.filter((entry) => {
      const joinedItems = entry.lineItems.map((item) => item.itemName).join(" ").toLowerCase();

      return (
        entry.momName.toLowerCase().includes(keyword) ||
        entry.contact.toLowerCase().includes(keyword) ||
        entry.campaignName.toLowerCase().includes(keyword) ||
        joinedItems.includes(keyword)
      );
    });
  }, [entries, searchTerm]);

  const stats = useMemo(() => {
    const totalAmount = entries.reduce((sum, entry) => sum + entry.totalAmount, 0);
    const totalOrders = entries.length;
    const totalItems = entries.reduce(
      (sum, entry) => sum + entry.lineItems.reduce((lineSum, item) => lineSum + item.quantity, 0),
      0,
    );
    const moms = new Set(entries.map((entry) => `${entry.momName}::${entry.contact}`)).size;

    return {
      totalAmount,
      totalOrders,
      totalItems,
      moms,
    };
  }, [entries]);

  const organizerSummary = useMemo<OrganizerSummary[]>(() => {
    const map = new Map<string, OrganizerSummary>();

    for (const entry of entries) {
      const key = `${entry.momName}::${entry.contact}`;
      const current = map.get(key) ?? {
        key,
        momName: entry.momName,
        contact: entry.contact,
        campaigns: [],
        totalOrders: 0,
        totalItems: 0,
        totalAmount: 0,
      };

      current.totalOrders += 1;
      current.totalItems += entry.lineItems.reduce((sum, item) => sum + item.quantity, 0);
      current.totalAmount += entry.totalAmount;

      if (!current.campaigns.includes(entry.campaignName)) {
        current.campaigns.push(entry.campaignName);
      }

      map.set(key, current);
    }

    return Array.from(map.values()).sort((left, right) => right.totalAmount - left.totalAmount);
  }, [entries]);

  const joinLink = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const url = new URL(window.location.href);
    url.searchParams.set("view", "join");
    return url.toString();
  }, [view]);

  const adminLink = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const url = new URL(window.location.href);
    url.searchParams.set("view", "admin");
    return url.toString();
  }, [view]);

  const inviteMessage = useMemo(
    () =>
      [
        "媽媽們可以用以下連結填團購資料:",
        joinLink || "[先開網站取得媽媽填表 link]",
        "",
        "團主登入後台連結:",
        adminLink || "[先開網站取得團主後台 link]",
      ].join("\n"),
    [adminLink, joinLink],
  );

  const adjustQuantity = (item: CampaignItem, delta: number) => {
    setQuantities((current) => ({
      ...current,
      [item.id]: Math.max(0, (current[item.id] ?? 0) + delta),
    }));
  };

  const resetForm = () => {
    if (selectedCampaign) {
      setQuantities(buildQuantityMap(campaigns, selectedCampaign.id));
    }
    setNotes("");
  };

  const copyText = async (value: string, label: string) => {
    if (!navigator.clipboard) {
      setFeedback(`未能複製 ${label}`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedLabel(label);
      setFeedback(`${label} 已複製`);
    } catch {
      setFeedback(`未能複製 ${label}`);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedCampaign) {
      setFeedback("請先建立團購項目");
      return;
    }

    if (!momName.trim() || !contact.trim()) {
      setFeedback("請先填寫媽媽名和聯絡資料");
      return;
    }

    if (selectedItems.length === 0) {
      setFeedback("請至少為一件物品加上數量");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      campaign_id: selectedCampaign.id,
      campaign_name: selectedCampaign.name,
      mom_name: momName.trim(),
      contact: contact.trim(),
      notes: notes.trim(),
      line_items: selectedItems,
      total_amount: formTotal,
    };

    if (onlineReady && supabase) {
      const { error } = await supabase.from("group_orders").insert(payload as never);

      if (error) {
        setFeedback(`提交失敗: ${error.message}`);
        setIsSubmitting(false);
        return;
      }
    } else {
      const demoEntry: OrderEntry = {
        id: createId(),
        campaignId: selectedCampaign.id,
        campaignName: selectedCampaign.name,
        momName: momName.trim(),
        contact: contact.trim(),
        notes: notes.trim(),
        lineItems: selectedItems,
        totalAmount: formTotal,
        createdAt: new Date().toISOString(),
      };

      setEntries((current) => [demoEntry, ...current]);
    }

    resetForm();
    setFeedback(onlineReady ? "已提交到雲端，團主可以即時查看" : "已提交到示範模式資料夾");
    setIsSubmitting(false);
  };

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!onlineReady || !supabase) {
      setFeedback("請先完成 Supabase 設定");
      setView("setup");
      return;
    }

    setIsAuthBusy(true);

    if (authMode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });

      if (error) {
        setFeedback(`登入失敗: ${error.message}`);
        setIsAuthBusy(false);
        return;
      }

      setFeedback("團主已登入");
    } else {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });

      if (error) {
        setFeedback(`建立帳戶失敗: ${error.message}`);
        setIsAuthBusy(false);
        return;
      }

      setFeedback("已送出建立帳戶要求，之後可用同一組資料登入");
    }

    setIsAuthBusy(false);
  };

  const updateDraft = (updater: (draft: CampaignPreset) => CampaignPreset) => {
    setCampaignDraft((current) => updater(current));
  };

  const handleSaveCampaign = async () => {
    const cleanedItems = campaignDraft.items
      .map((item) => ({
        ...item,
        name: item.name.trim(),
        price: Number(item.price) || 0,
      }))
      .filter((item) => item.name);

    const cleanedCampaign: CampaignPreset = {
      ...campaignDraft,
      name: campaignDraft.name.trim(),
      description: campaignDraft.description.trim(),
      items: cleanedItems,
    };

    if (!cleanedCampaign.name) {
      setFeedback("請先輸入團購項目名稱");
      return;
    }

    if (cleanedCampaign.items.length === 0) {
      setFeedback("請至少加入一件物品");
      return;
    }

    setIsSavingCampaign(true);

    if (onlineReady && supabase) {
      if (!session) {
        setFeedback("請先用團主帳戶登入，先可以修改團購項目");
        setIsSavingCampaign(false);
        return;
      }

      const existingIndex = campaigns.findIndex((item) => item.id === cleanedCampaign.id);
      const sortOrder = existingIndex >= 0 ? existingIndex : campaigns.length;

      const { error: campaignError } = await supabase.from("group_campaigns").upsert({
        id: cleanedCampaign.id,
        name: cleanedCampaign.name,
        description: cleanedCampaign.description,
        sort_order: sortOrder,
      } as never);

      if (campaignError) {
        setFeedback(`儲存團購項目失敗: ${campaignError.message}`);
        setIsSavingCampaign(false);
        return;
      }

      const { error: deleteError } = await supabase
        .from("group_campaign_items")
        .delete()
        .eq("campaign_id", cleanedCampaign.id);

      if (deleteError) {
        setFeedback(`更新物品清單失敗: ${deleteError.message}`);
        setIsSavingCampaign(false);
        return;
      }

      const { error: itemError } = await supabase.from("group_campaign_items").insert(
        cleanedCampaign.items.map((item, index) => ({
          id: item.id,
          campaign_id: cleanedCampaign.id,
          name: item.name,
          price: item.price,
          sort_order: index,
        })) as never,
      );

      if (itemError) {
        setFeedback(`更新物品清單失敗: ${itemError.message}`);
        setIsSavingCampaign(false);
        return;
      }
    } else {
      setCampaigns((current) => {
        const next = current.some((item) => item.id === cleanedCampaign.id)
          ? current.map((item) => (item.id === cleanedCampaign.id ? cleanedCampaign : item))
          : [...current, cleanedCampaign];

        return normalizeCampaigns(next);
      });
    }

    setCampaignDraft(cloneCampaign(cleanedCampaign));
    setEditorCampaignId(cleanedCampaign.id);
    setSelectedCampaignId(cleanedCampaign.id);
    setFeedback(onlineReady ? "團購項目已同步到雲端" : "團購項目已儲存在本機");
    setIsSavingCampaign(false);
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    const target = campaigns.find((campaign) => campaign.id === campaignId);
    if (!target) {
      return;
    }

    if (!window.confirm(`確定刪除「${target.name || "未命名團購"}」嗎？`)) {
      return;
    }

    if (onlineReady && supabase) {
      if (!session) {
        setFeedback("請先登入團主帳戶");
        return;
      }

      const { error } = await supabase.from("group_campaigns").delete().eq("id", campaignId);

      if (error) {
        setFeedback(`刪除失敗: ${error.message}`);
        return;
      }
    } else {
      const remainingCampaigns = campaigns.filter((campaign) => campaign.id !== campaignId);
      setCampaigns(remainingCampaigns);

      if (remainingCampaigns[0]) {
        setEditorCampaignId(remainingCampaigns[0].id);
        setSelectedCampaignId(remainingCampaigns[0].id);
      } else {
        const emptyCampaign = createEmptyCampaign();
        setEditorCampaignId(emptyCampaign.id);
        setCampaignDraft(emptyCampaign);
        setSelectedCampaignId("");
      }
    }

    setFeedback("團購項目已刪除");
  };

  const importDefaults = async () => {
    setIsSavingCampaign(true);

    if (onlineReady && supabase) {
      if (!session) {
        setFeedback("請先登入團主帳戶");
        setIsSavingCampaign(false);
        return;
      }

      const { error: campaignError } = await supabase.from("group_campaigns").upsert(
        DEFAULT_CAMPAIGNS.map((campaign, index) => ({
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          sort_order: index,
        })) as never,
      );

      if (campaignError) {
        setFeedback(`匯入預設團購失敗: ${campaignError.message}`);
        setIsSavingCampaign(false);
        return;
      }

      const { error: deleteError } = await supabase.from("group_campaign_items").delete().neq("id", "");

      if (deleteError) {
        setFeedback(`清理舊物品失敗: ${deleteError.message}`);
        setIsSavingCampaign(false);
        return;
      }

      const allItems = DEFAULT_CAMPAIGNS.flatMap((campaign) =>
        campaign.items.map((item, index) => ({
          id: item.id,
          campaign_id: campaign.id,
          name: item.name,
          price: item.price,
          sort_order: index,
        })),
      );

      const { error: itemError } = await supabase.from("group_campaign_items").insert(allItems as never);

      if (itemError) {
        setFeedback(`匯入預設物品失敗: ${itemError.message}`);
        setIsSavingCampaign(false);
        return;
      }
    } else {
      setCampaigns(DEFAULT_CAMPAIGNS);
      setEditorCampaignId(DEFAULT_CAMPAIGNS[0]?.id ?? "");
      setSelectedCampaignId(DEFAULT_CAMPAIGNS[0]?.id ?? "");
    }

    setFeedback("預設團購項目已加入");
    setIsSavingCampaign(false);
  };

  const exportCsv = () => {
    const rows = [
      ["提交時間", "團購項目", "媽媽名", "聯絡資料", "物品", "單價", "數量", "小計", "備註"],
      ...filteredEntries.flatMap((entry) =>
        entry.lineItems.map((item) => [
          formatDateTime(entry.createdAt),
          entry.campaignName,
          entry.momName,
          entry.contact,
          item.itemName,
          item.price.toString(),
          item.quantity.toString(),
          item.subtotal.toString(),
          entry.notes,
        ]),
      ),
    ];

    const csv = `\ufeff${rows
      .map((row) => row.map((cell) => `"${cell.split('"').join('""')}"`).join(","))
      .join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mama-group-buy-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] shadow-[0_28px_80px_rgba(79,52,39,0.12)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.35fr_0.95fr] lg:p-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
                <span className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1">
                  媽媽團購協作站
                </span>
                <span className="rounded-full border border-[var(--line)] bg-[var(--accent-soft)] px-3 py-1 text-[var(--accent)]">
                  {onlineReady ? "Supabase 雲端同步" : "示範模式"}
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="font-[var(--font-display)] text-4xl leading-none text-[var(--ink)] sm:text-5xl">
                  媽媽 group 團購
                  <br />
                  團主而家可以自己改項目。
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                  Option B 已經升級成免寫 code 版本。媽媽只要揀團購項目就會列出全團物品，而團主登入後可以直接喺後台新增團購、改物品名、改價錢、刪除舊團，所有裝置會同步更新。
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <NavButton
                  active={view === "join"}
                  icon={<ShoppingBasket className="h-4 w-4" />}
                  label="媽媽填表"
                  onClick={() => setView("join")}
                />
                <NavButton
                  active={view === "admin"}
                  icon={<LockKeyhole className="h-4 w-4" />}
                  label="團主後台"
                  onClick={() => setView("admin")}
                />
                <NavButton
                  active={view === "setup"}
                  icon={<Settings2 className="h-4 w-4" />}
                  label="雲端設定"
                  onClick={() => setView("setup")}
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-[1.75rem] border border-[var(--line)] bg-[var(--paper-strong)] p-4 sm:grid-cols-2">
              <ActionCard
                icon={<Link2 className="h-5 w-5" />}
                title="分享媽媽填表 link"
                description="發去 WhatsApp / Signal 就用得。"
                actionLabel={copiedLabel === "媽媽填表連結" ? "已複製" : "複製連結"}
                onAction={() => {
                  void copyText(joinLink, "媽媽填表連結");
                }}
              />
              <ActionCard
                icon={<LogIn className="h-5 w-5" />}
                title="團主登入 link"
                description="團主喺另一部機打開都可以登入。"
                actionLabel={copiedLabel === "團主登入連結" ? "已複製" : "複製後台連結"}
                onAction={() => {
                  void copyText(adminLink, "團主登入連結");
                }}
              />
              <StatTile
                icon={<Users className="h-5 w-5 text-[#1d6c63]" />}
                label="參與媽媽"
                value={stats.moms}
              />
              <StatTile
                icon={<Wallet className="h-5 w-5 text-[var(--accent)]" />}
                label="總應收"
                value={formatMoney(stats.totalAmount)}
              />
            </div>
          </div>
        </section>

        {feedback ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-[var(--ink)] shadow-sm backdrop-blur">
            {feedback}
          </div>
        ) : null}

        {view === "join" ? (
          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <article className="rounded-[2rem] border border-[var(--line)] bg-white/88 p-5 shadow-[0_18px_60px_rgba(79,52,39,0.08)] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Join</p>
                  <h2 className="mt-2 font-[var(--font-display)] text-3xl text-[var(--ink)]">媽媽填表</h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm text-[var(--accent)]">
                  <Sparkles className="h-4 w-4" />
                  {isLoadingCampaigns ? "更新中" : `${campaigns.length} 個團購項目`}
                </div>
              </div>

              {!hasCampaigns ? (
                <div className="mt-6 rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4 text-sm leading-6 text-[var(--muted)]">
                  暫時未有團購項目。團主可以去「團主後台」新增第一個團購。
                </div>
              ) : (
                <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[var(--ink)]">選擇團購項目</span>
                    <select
                      className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                      value={selectedCampaign?.id ?? ""}
                      onChange={(event) => setSelectedCampaignId(event.target.value)}
                    >
                      {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedCampaign ? (
                    <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--ink)]">{selectedCampaign.name}</p>
                          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                            {selectedCampaign.description || "請直接為每件物品加減數量。"}
                          </p>
                        </div>
                        <div className="rounded-full bg-white px-3 py-1 text-xs text-[var(--muted)]">
                          共 {selectedCampaign.items.length} 款物品
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {selectedCampaign.items.map((item, index) => (
                          <ItemRow
                            key={item.id}
                            index={index}
                            item={item}
                            quantity={quantities[item.id] ?? 0}
                            onMinus={() => adjustQuantity(item, -1)}
                            onPlus={() => adjustQuantity(item, 1)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--ink)]">媽媽名</span>
                      <input
                        className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                        value={momName}
                        onChange={(event) => setMomName(event.target.value)}
                        placeholder="例如: 琪琪媽媽"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--ink)]">聯絡資料</span>
                      <input
                        className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                        value={contact}
                        onChange={(event) => setContact(event.target.value)}
                        placeholder="電話 / WhatsApp / Signal"
                      />
                    </label>
                  </div>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[var(--ink)]">備註</span>
                    <textarea
                      className="min-h-28 w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="例如: 想同另一位媽媽夾單 / 放學交收"
                    />
                  </label>

                  <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper-strong)] p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-[var(--muted)]">已選物品</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--ink)]">
                          {selectedItems.length} 款 / {selectedItems.reduce((sum, item) => sum + item.quantity, 0)} 件
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-sm text-[var(--muted)]">今張單總額</p>
                        <p className="mt-1 text-3xl font-semibold text-[var(--accent)]">{formatMoney(formTotal)}</p>
                      </div>
                    </div>

                    {selectedItems.length > 0 ? (
                      <div className="mt-4 space-y-2 rounded-2xl bg-white/80 p-3">
                        {selectedItems.map((item) => (
                          <div key={item.itemId} className="flex items-center justify-between gap-3 text-sm">
                            <p className="text-[var(--ink)]">
                              {item.itemName} <span className="text-[var(--muted)]">x {item.quantity}</span>
                            </p>
                            <p className="font-medium text-[var(--ink)]">{formatMoney(item.subtotal)}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    送出團購資料
                  </button>
                </form>
              )}
            </article>

            <article className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_18px_60px_rgba(79,52,39,0.08)] sm:p-6">
              <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">How It Works</p>
              <h2 className="mt-2 font-[var(--font-display)] text-3xl text-[var(--ink)]">唔使再改 code</h2>
              <div className="mt-6 space-y-4">
                <GuideBlock
                  title="團主之後點樣改團購項目？"
                  body="登入『團主後台』，入去『團購項目管理』，直接改團名、加物品、改價錢，再按儲存就完成。"
                />
                <GuideBlock
                  title="媽媽見到嘅內容會點？"
                  body="媽媽只會見到你最新儲存好的物品清單，揀咗團購項目後就可以逐件加減數量。"
                />
                <GuideBlock
                  title="資料會唔會同步？"
                  body="完成 Supabase 設定後，分享同一條連結俾媽媽，團主喺另一部機登入都會即時睇到提交。"
                />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <SummaryCard
                  icon={<Package className="h-5 w-5" />}
                  label="總訂單數"
                  value={stats.totalOrders}
                />
                <SummaryCard
                  icon={<ShoppingBasket className="h-5 w-5" />}
                  label="總件數"
                  value={stats.totalItems}
                />
              </div>
            </article>
          </section>
        ) : null}

        {view === "admin" ? (
          <section className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
            <div className="space-y-6">
              <article className="rounded-[2rem] border border-[var(--line)] bg-white/88 p-5 shadow-[0_18px_60px_rgba(79,52,39,0.08)] sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Organizer</p>
                    <h2 className="mt-2 font-[var(--font-display)] text-3xl text-[var(--ink)]">團主登入與結算</h2>
                  </div>
                  {session ? (
                    <button
                      type="button"
                      onClick={() => {
                        void supabase?.auth.signOut();
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
                    >
                      <LogOut className="h-4 w-4" /> 登出
                    </button>
                  ) : null}
                </div>

                {!onlineReady ? (
                  <div className="mt-6 rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">而家係示範模式</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      你已經可以直接喺下面改團購項目，但資料只會留喺呢部機。想俾成個 group 一齊 online 用，就去「雲端設定」頁面完成 Supabase 設定。
                    </p>
                    <button
                      type="button"
                      onClick={() => setView("setup")}
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
                    >
                      去設定 <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : session ? (
                  <div className="mt-6 space-y-4">
                    <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
                      <p className="text-sm text-[var(--muted)]">已登入帳戶</p>
                      <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{session.user.email}</p>
                    </div>

                    <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper-strong)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--ink)]">每位媽媽應付總額</p>
                          <p className="mt-1 text-sm text-[var(--muted)]">已把同一位媽媽的不同訂單合併。</p>
                        </div>
                        <button
                          type="button"
                          onClick={exportCsv}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)]"
                        >
                          <Download className="h-4 w-4" /> CSV
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {organizerSummary.length === 0 ? (
                          <EmptyState message="未有媽媽提交資料。" />
                        ) : (
                          organizerSummary.map((summary) => (
                            <div
                              key={summary.key}
                              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-base font-semibold text-[var(--ink)]">{summary.momName}</p>
                                  <p className="text-sm text-[var(--muted)]">{summary.contact}</p>
                                </div>
                                <div className="text-left sm:text-right">
                                  <p className="text-lg font-semibold text-[var(--accent)]">{formatMoney(summary.totalAmount)}</p>
                                  <p className="text-xs text-[var(--muted)]">
                                    {summary.totalOrders} 單 / {summary.totalItems} 件
                                  </p>
                                </div>
                              </div>
                              <p className="mt-3 text-sm text-[var(--muted)]">
                                參與團購: {summary.campaigns.join("、")}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <form className="mt-6 space-y-4" onSubmit={handleAuth}>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--ink)]">團主電郵</span>
                      <input
                        type="email"
                        className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                        value={authEmail}
                        onChange={(event) => setAuthEmail(event.target.value)}
                        placeholder="you@example.com"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--ink)]">密碼</span>
                      <input
                        type="password"
                        className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        placeholder="至少 6 個字元"
                      />
                    </label>

                    <div className="flex flex-wrap gap-3 text-sm">
                      <button
                        type="button"
                        onClick={() => setAuthMode("signin")}
                        className={`rounded-full px-4 py-2 ${
                          authMode === "signin"
                            ? "bg-[var(--ink)] text-white"
                            : "border border-[var(--line)] text-[var(--ink)]"
                        }`}
                      >
                        已有帳戶，登入
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthMode("signup")}
                        className={`rounded-full px-4 py-2 ${
                          authMode === "signup"
                            ? "bg-[var(--ink)] text-white"
                            : "border border-[var(--line)] text-[var(--ink)]"
                        }`}
                      >
                        第一次使用，建立帳戶
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={isAuthBusy}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isAuthBusy ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                      {authMode === "signin" ? "登入團主後台" : "建立團主帳戶"}
                    </button>
                  </form>
                )}
              </article>

              <article className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_18px_60px_rgba(79,52,39,0.08)] sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Manage</p>
                    <h2 className="mt-2 font-[var(--font-display)] text-3xl text-[var(--ink)]">團購項目管理</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = createEmptyCampaign();
                      setEditorCampaignId(next.id);
                      setCampaignDraft(next);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)]"
                  >
                    <Plus className="h-4 w-4" /> 新增團購
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {campaigns.length === 0 ? (
                    <EmptyState message="未有團購項目，請新增第一個團。" />
                  ) : (
                    campaigns.map((campaign) => (
                      <button
                        key={campaign.id}
                        type="button"
                        onClick={() => setEditorCampaignId(campaign.id)}
                        className={`w-full rounded-[1.5rem] border px-4 py-4 text-left transition ${
                          editorCampaignId === campaign.id
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--line)] bg-white/80 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[var(--ink)]">{campaign.name}</p>
                            <p className="mt-1 text-sm text-[var(--muted)]">{campaign.items.length} 款物品</p>
                          </div>
                          <PencilLine className="h-4 w-4 text-[var(--muted)]" />
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void importDefaults();
                  }}
                  disabled={isSavingCampaign}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  一鍵加入預設示範團購
                </button>
              </article>
            </div>

            <div className="space-y-6">
              <article className="rounded-[2rem] border border-[var(--line)] bg-white/88 p-5 shadow-[0_18px_60px_rgba(79,52,39,0.08)] sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Editor</p>
                    <h2 className="mt-2 font-[var(--font-display)] text-3xl text-[var(--ink)]">修改團購內容</h2>
                  </div>
                  <div className="flex gap-2">
                    {campaigns.some((campaign) => campaign.id === campaignDraft.id) ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleDeleteCampaign(campaignDraft.id);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)]"
                      >
                        <Trash2 className="h-4 w-4" /> 刪除
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        void handleSaveCampaign();
                      }}
                      disabled={isSavingCampaign}
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingCampaign ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      儲存修改
                    </button>
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[var(--ink)]">團購項目名稱</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                      value={campaignDraft.name}
                      onChange={(event) => {
                        updateDraft((current) => ({ ...current, name: event.target.value }));
                      }}
                      placeholder="例如: 貼紙團"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[var(--ink)]">簡介</span>
                    <textarea
                      className="min-h-24 w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                      value={campaignDraft.description}
                      onChange={(event) => {
                        updateDraft((current) => ({ ...current, description: event.target.value }));
                      }}
                      placeholder="例如: 一次過列出今團所有貼紙"
                    />
                  </label>

                  <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper-strong)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--ink)]">物品與價錢</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">媽媽揀團之後，就會見到以下全部物品。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          updateDraft((current) => ({
                            ...current,
                            items: [...current.items, { id: createId(), name: "", price: 0 }],
                          }));
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)]"
                      >
                        <Plus className="h-4 w-4" /> 加物品
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {campaignDraft.items.map((item, index) => (
                        <div
                          key={item.id}
                          className="grid gap-3 rounded-[1.25rem] border border-[var(--line)] bg-white p-3 md:grid-cols-[44px_1fr_120px_auto]"
                        >
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--paper)] font-semibold text-[var(--accent)]">
                            {index + 1}
                          </div>
                          <input
                            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                            value={item.name}
                            onChange={(event) => {
                              updateDraft((current) => ({
                                ...current,
                                items: current.items.map((draftItem) =>
                                  draftItem.id === item.id
                                    ? { ...draftItem, name: event.target.value }
                                    : draftItem,
                                ),
                              }));
                            }}
                            placeholder="物品名，例如: 水果貼紙"
                          />
                          <input
                            type="number"
                            min="0"
                            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                            value={item.price}
                            onChange={(event) => {
                              updateDraft((current) => ({
                                ...current,
                                items: current.items.map((draftItem) =>
                                  draftItem.id === item.id
                                    ? { ...draftItem, price: Number(event.target.value) || 0 }
                                    : draftItem,
                                ),
                              }));
                            }}
                            placeholder="價錢"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              updateDraft((current) => ({
                                ...current,
                                items:
                                  current.items.length === 1
                                    ? [{ id: createId(), name: "", price: 0 }]
                                    : current.items.filter((draftItem) => draftItem.id !== item.id),
                              }));
                            }}
                            className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-[var(--ink)]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-white/70 p-4 text-sm leading-6 text-[var(--muted)]">
                    提示: 以後你要開新團，只需要按「新增團購」；要改價錢，就喺呢度直接改數字再按「儲存修改」。唔需要打開任何 code 檔案。
                  </div>
                </div>
              </article>

              <article className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_18px_60px_rgba(79,52,39,0.08)] sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Orders</p>
                    <h2 className="mt-2 font-[var(--font-display)] text-3xl text-[var(--ink)]">所有提交資料</h2>
                  </div>
                  <label className="relative block sm:w-72">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      className="w-full rounded-full border border-[var(--line)] bg-white px-11 py-3 outline-none transition focus:border-[var(--accent)]"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="搜尋媽媽 / 聯絡 / 物品"
                    />
                  </label>
                </div>

                <div className="mt-6 space-y-4">
                  {isLoadingEntries ? <EmptyState message="雲端資料載入中..." /> : null}
                  {!isLoadingEntries && filteredEntries.length === 0 ? <EmptyState message="暫時未有符合條件的資料。" /> : null}
                  {!isLoadingEntries &&
                    filteredEntries.map((entry) => (
                      <div key={entry.id} className="rounded-[1.5rem] border border-[var(--line)] bg-white/85 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
                              {entry.campaignName}
                            </div>
                            <h3 className="mt-3 text-lg font-semibold text-[var(--ink)]">{entry.momName}</h3>
                            <p className="text-sm text-[var(--muted)]">{entry.contact}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm text-[var(--muted)]">{formatDateTime(entry.createdAt)}</p>
                            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{formatMoney(entry.totalAmount)}</p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 rounded-2xl bg-[var(--paper)] p-3">
                          {entry.lineItems.map((item) => (
                            <div key={`${entry.id}-${item.itemId}`} className="flex items-center justify-between gap-3 text-sm">
                              <p className="text-[var(--ink)]">
                                {item.itemName} <span className="text-[var(--muted)]">x {item.quantity}</span>
                              </p>
                              <p className="font-medium text-[var(--ink)]">{formatMoney(item.subtotal)}</p>
                            </div>
                          ))}
                        </div>

                        {entry.notes ? (
                          <div className="mt-3 rounded-2xl border border-dashed border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]">
                            備註: {entry.notes}
                          </div>
                        ) : null}
                      </div>
                    ))}
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {view === "setup" ? (
          <section className="space-y-6">
            <article className="rounded-[2rem] border border-[var(--line)] bg-white/88 p-5 shadow-[0_18px_60px_rgba(79,52,39,0.08)] sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Setup Guide</p>
                  <h2 className="mt-2 font-[var(--font-display)] text-3xl text-[var(--ink)]">超簡單操作教學</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                    跟住以下 4 步做，就可以開到一個俾全 group 媽媽一齊填的團購網站。每一步都寫成圖片式文字，你照住畫面找相同按鈕就得。
                  </p>
                </div>

                <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper-strong)] px-4 py-3 text-sm text-[var(--muted)]">
                  <p className="font-medium text-[var(--ink)]">目前狀態</p>
                  <p className="mt-1">
                    {onlineReady
                      ? "已讀到 Supabase 設定。下一步請貼 SQL，再建立團主帳戶登入。"
                      : "未讀到 Supabase 設定，現時仍是本機版。"}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <StepCard
                  step="Step 1"
                  icon={<Database className="h-5 w-5" />}
                  title="點開 Supabase"
                  lines={[
                    "[畫面] 打開瀏覽器，去 https://supabase.com",
                    "[畫面] 右上角按 Start your project 或 Sign in。",
                    "[畫面] 登入後按 New project。",
                    "[填寫] Project name 可寫: mama-group-buy。",
                    "[填寫] Database Password 自己設定一個密碼，記低佢。",
                    "[按鈕] 撳 Create new project，等 1 至 2 分鐘。",
                    "[完成後] 左邊 menu 會見到 Table Editor、SQL Editor、Authentication、Settings。",
                  ]}
                />

                <StepCard
                  step="Step 2"
                  icon={<KeyRound className="h-5 w-5" />}
                  title="點拎 URL 同 Key"
                  lines={[
                    "[畫面] 喺 Supabase 左下角按 Settings。",
                    "[畫面] 再按 API。",
                    "[你會見到] Project URL。",
                    "[你會見到] anon public key。",
                    "[要做] 將呢兩個值交俾幫你部署網站的人，或者放入 .env.local。",
                    "[格式] VITE_SUPABASE_URL=你的 Project URL",
                    "[格式] VITE_SUPABASE_ANON_KEY=你的 anon key",
                  ]}
                />

                <StepCard
                  step="Step 3"
                  icon={<FileCode2 className="h-5 w-5" />}
                  title="點貼 SQL"
                  lines={[
                    "[畫面] 喺網站內打開「雲端設定」頁。",
                    "[按鈕] 撳「複製 SQL」。",
                    "[畫面] 返去 Supabase 左邊按 SQL Editor。",
                    "[按鈕] 撳 New query。",
                    "[動作] 將成段 SQL 貼入大白色輸入框。",
                    "[按鈕] 撳右下角 Run。",
                    "[成功] 如果冇紅字 error，就代表資料表已經建立好。",
                  ]}
                />

                <StepCard
                  step="Step 4"
                  icon={<UserRound className="h-5 w-5" />}
                  title="點建立團主 login"
                  lines={[
                    "[畫面] 喺你個網站按上方「團主後台」。",
                    "[畫面] 如果未有帳戶，揀「建立帳戶 / Sign up」。",
                    "[填寫] 輸入團主 email 同 password。",
                    "[按鈕] 撳建立帳戶。",
                    "[可能會有] 某些 Supabase 設定會寄 email 驗證信，去 email 撳確認。",
                    "[之後] 返回網站，用同一個 email/password 登入。",
                    "[登入後] 就可以跨裝置睇所有媽媽提交、更新團購項目、睇每位媽媽應付總額。",
                  ]}
                />
              </div>
            </article>

            <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <article className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_18px_60px_rgba(79,52,39,0.08)] sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Ready To Share</p>
                    <h2 className="mt-2 font-[var(--font-display)] text-3xl text-[var(--ink)]">點發 link 俾媽媽</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void copyText(inviteMessage, "邀請訊息");
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)]"
                  >
                    <Share2 className="h-4 w-4" /> 複製邀請訊息
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  <StepStrip
                    icon={<MousePointerClick className="h-4 w-4" />}
                    title="1. 開網站後，按「媽媽填表」"
                    description="呢個頁面就係俾媽媽落單用。"
                  />
                  <StepStrip
                    icon={<Link2 className="h-4 w-4" />}
                    title="2. 撳「複製媽媽填表 link」"
                    description="網站會自動複製一條網址去你剪貼簿。"
                  />
                  <StepStrip
                    icon={<Share2 className="h-4 w-4" />}
                    title="3. 打開 WhatsApp 家長 group"
                    description="直接貼上條 link，或者撳上面「複製邀請訊息」一次過貼埋說明。"
                  />
                  <StepStrip
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    title="4. 媽媽打開連結就可以填"
                    description="她們揀團購項目後，會見到全部物品，同一張單可以一次過交。"
                  />
                </div>

                <div className="mt-6 rounded-[1.5rem] border border-[var(--line)] bg-white/80 p-4">
                  <p className="text-sm font-medium text-[var(--ink)]">建議你喺 WhatsApp 直接貼這段:</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-[1.25rem] bg-[var(--paper)] p-4 text-xs leading-6 text-[var(--ink)]">
                    <code>{inviteMessage}</code>
                  </pre>
                </div>
              </article>

              <article className="rounded-[2rem] border border-[var(--line)] bg-white/88 p-5 shadow-[0_18px_60px_rgba(79,52,39,0.08)] sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">SQL</p>
                    <h2 className="mt-2 font-[var(--font-display)] text-3xl text-[var(--ink)]">建立資料表</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void copyText(ORGANIZER_SQL, "Supabase SQL");
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)]"
                  >
                    <Copy className="h-4 w-4" /> 複製 SQL
                  </button>
                </div>

                <div className="mt-6 rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper-strong)] p-4 text-sm leading-7 text-[var(--muted)]">
                  <p className="font-medium text-[var(--ink)]">貼 SQL 前先確認</p>
                  <p>1. 你已經喺 Supabase 建好 project。</p>
                  <p>2. 你而家身處 SQL Editor，不是 Table Editor。</p>
                  <p>3. 貼上後按 Run，如見綠色成功訊息即可。</p>
                </div>

                <pre className="mt-6 overflow-x-auto rounded-[1.5rem] border border-[var(--line)] bg-[#1f1713] p-4 text-xs leading-6 text-[#f6eadf]">
                  <code>{ORGANIZER_SQL}</code>
                </pre>
              </article>
            </section>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-[var(--ink)] text-white"
          : "border border-[var(--line)] bg-white/80 text-[var(--ink)] hover:bg-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ActionCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/80 p-4">
      <div className="flex items-center gap-2 text-[var(--accent)]">{icon}</div>
      <h3 className="mt-3 text-base font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
      >
        <Copy className="h-4 w-4" />
        {actionLabel}
      </button>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2 text-[var(--accent)]">{icon}</div>
      <p className="mt-4 text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/85 p-4">
      <div>{icon}</div>
      <p className="mt-3 text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function ItemRow({
  index,
  item,
  quantity,
  onMinus,
  onPlus,
}: {
  index: number;
  item: CampaignItem;
  quantity: number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] px-4 py-4 transition hover:translate-y-[-1px] hover:bg-[var(--paper-strong)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white font-semibold text-[var(--accent)]">
        {index + 1}
      </div>
      <div>
        <p className="text-base font-semibold text-[var(--ink)]">{item.name}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{formatMoney(item.price)} / 件</p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-2 py-2">
        <button
          type="button"
          onClick={onMinus}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--paper)] text-[var(--ink)]"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-8 text-center text-base font-semibold text-[var(--ink)]">{quantity}</span>
        <button
          type="button"
          onClick={onPlus}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function GuideBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/80 p-4">
      <p className="text-base font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  lines,
}: {
  step: string;
  icon: ReactNode;
  title: string;
  lines: string[];
}) {
  return (
    <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(79,52,39,0.06)]">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{step}</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">{title}</h3>
        </div>
      </div>

      <div className="mt-4 space-y-2 rounded-[1.25rem] border border-dashed border-[var(--line)] bg-white/80 p-4 text-sm leading-7 text-[var(--muted)]">
        {lines.map((line) => (
          <p key={`${step}-${line}`}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function StepStrip({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 rounded-[1.25rem] border border-[var(--line)] bg-white/80 p-4">
      <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-white/70 px-4 py-8 text-center text-sm text-[var(--muted)]">
      {message}
    </div>
  );
}