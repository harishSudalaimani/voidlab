"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleDollarSign,
  CreditCard,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Transaction = { id: string; title: string; category: string; amount: number; date: string; kind: "income" | "expense" };
type Budget = { id: string; category: string; limit: number };
type Subscription = { id: string; name: string; amount: number; cycle: "Monthly" | "Yearly"; nextDate: string };
type SavingsGoal = { id: string; name: string; target: number; saved: number };
type Investment = { id: string; name: string; type: string; value: number };
type FinanceData = { currency: string; transactions: Transaction[]; budgets: Budget[]; subscriptions: Subscription[]; goals: SavingsGoal[]; investments: Investment[] };
type FinancePanel = "Overview" | "Transactions" | "Budgets" | "Subscriptions" | "Savings" | "Investments";

const EMPTY_DATA: FinanceData = { currency: "INR", transactions: [], budgets: [], subscriptions: [], goals: [], investments: [] };
const PANELS: { name: FinancePanel; icon: typeof Wallet }[] = [
  { name: "Overview", icon: ChartNoAxesCombined },
  { name: "Transactions", icon: CreditCard },
  { name: "Budgets", icon: CircleDollarSign },
  { name: "Subscriptions", icon: Banknote },
  { name: "Savings", icon: Target },
  { name: "Investments", icon: TrendingUp },
];

function asMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString("en-IN")}`;
  }
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function FinanceDashboard({ storageScope }: { storageScope: string }) {
  const storageKey = `planit-finance-v1:${encodeURIComponent(storageScope)}`;
  const [data, setData] = useState<FinanceData>(EMPTY_DATA);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [panel, setPanel] = useState<FinancePanel>("Overview");
  const [month, setMonth] = useState(currentMonth);
  const [transactionTitle, setTransactionTitle] = useState("");
  const [transactionCategory, setTransactionCategory] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionKind, setTransactionKind] = useState<Transaction["kind"]>("expense");
  const [transactionDate, setTransactionDate] = useState(localDate);
  const [budgetName, setBudgetName] = useState("");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [subscriptionName, setSubscriptionName] = useState("");
  const [subscriptionAmount, setSubscriptionAmount] = useState("");
  const [subscriptionCycle, setSubscriptionCycle] = useState<Subscription["cycle"]>("Monthly");
  const [subscriptionNextDate, setSubscriptionNextDate] = useState(localDate);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [investmentName, setInvestmentName] = useState("");
  const [investmentType, setInvestmentType] = useState("");
  const [investmentValue, setInvestmentValue] = useState("");

  useEffect(() => {
    let restored = EMPTY_DATA;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FinanceData>;
        restored = {
          currency: typeof parsed.currency === "string" ? parsed.currency : EMPTY_DATA.currency,
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
          budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
          subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
          goals: Array.isArray(parsed.goals) ? parsed.goals : [],
          investments: Array.isArray(parsed.investments) ? parsed.investments : [],
        };
      }
    } catch { /* Start with an empty finance space if local storage is unavailable. */ }
    setData(restored);
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* Keep the current session usable if storage is full. */ }
  }, [data, loadedKey, storageKey]);

  const monthTransactions = useMemo(() => data.transactions.filter((entry) => entry.date.startsWith(month)), [data.transactions, month]);
  const income = monthTransactions.filter((entry) => entry.kind === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const expenses = monthTransactions.filter((entry) => entry.kind === "expense").reduce((sum, entry) => sum + entry.amount, 0);
  const net = income - expenses;
  const expensesByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    monthTransactions.filter((entry) => entry.kind === "expense").forEach((entry) => totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amount));
    return [...totals].sort((a, b) => b[1] - a[1]);
  }, [monthTransactions]);
  const peakCategorySpend = Math.max(...expensesByCategory.map(([, amount]) => amount), 1);

  function addTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(transactionAmount);
    if (!transactionTitle.trim() || !Number.isFinite(amount) || amount <= 0) return;
    setData((current) => ({ ...current, transactions: [{ id: crypto.randomUUID(), title: transactionTitle.trim(), category: transactionCategory.trim() || "Other", amount, date: transactionDate, kind: transactionKind }, ...current.transactions] }));
    setTransactionTitle(""); setTransactionCategory(""); setTransactionAmount(""); setTransactionDate(localDate());
  }

  function addBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const limit = Number(budgetLimit);
    if (!budgetName.trim() || !Number.isFinite(limit) || limit <= 0) return;
    setData((current) => ({ ...current, budgets: [{ id: crypto.randomUUID(), category: budgetName.trim(), limit }, ...current.budgets] }));
    setBudgetName(""); setBudgetLimit("");
  }

  function addSubscription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(subscriptionAmount);
    if (!subscriptionName.trim() || !Number.isFinite(amount) || amount <= 0) return;
    setData((current) => ({ ...current, subscriptions: [{ id: crypto.randomUUID(), name: subscriptionName.trim(), amount, cycle: subscriptionCycle, nextDate: subscriptionNextDate }, ...current.subscriptions] }));
    setSubscriptionName(""); setSubscriptionAmount("");
  }

  function addGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = Number(goalTarget);
    if (!goalName.trim() || !Number.isFinite(target) || target <= 0) return;
    setData((current) => ({ ...current, goals: [{ id: crypto.randomUUID(), name: goalName.trim(), target, saved: 0 }, ...current.goals] }));
    setGoalName(""); setGoalTarget("");
  }

  function addInvestment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(investmentValue);
    if (!investmentName.trim() || !Number.isFinite(value) || value < 0) return;
    setData((current) => ({ ...current, investments: [{ id: crypto.randomUUID(), name: investmentName.trim(), type: investmentType.trim() || "Other", value }, ...current.investments] }));
    setInvestmentName(""); setInvestmentType(""); setInvestmentValue("");
  }

  function remove<K extends keyof Pick<FinanceData, "transactions" | "budgets" | "subscriptions" | "goals" | "investments">>(key: K, id: string) {
    setData((current) => ({ ...current, [key]: current[key].filter((item) => item.id !== id) }));
  }

  const monthlySubscriptions = data.subscriptions.reduce((sum, subscription) => sum + subscription.amount * (subscription.cycle === "Yearly" ? 1 / 12 : 1), 0);
  const portfolioValue = data.investments.reduce((sum, item) => sum + item.value, 0);

  return (
    <section className="finance-section" aria-label="Finance">
      <div className="finance-heading">
        <div><p className="planner-eyebrow">PERSONAL FINANCE</p><h2>Your money, with a clearer view.</h2><p>Keep your day-to-day money organized in one place.</p></div>
        <label className="finance-currency"><span>Currency</span><select value={data.currency} onChange={(event) => setData((current) => ({ ...current, currency: event.target.value }))}><option value="INR">INR · ₹</option><option value="USD">USD · $</option><option value="EUR">EUR · €</option><option value="GBP">GBP · £</option><option value="CAD">CAD · $</option><option value="AUD">AUD · $</option></select></label>
      </div>

      <nav className="finance-nav" aria-label="Finance sections">
        {PANELS.map(({ name, icon: Icon }) => <button type="button" key={name} onClick={() => setPanel(name)} className={cn("finance-nav-item", panel === name && "is-active")} aria-current={panel === name ? "page" : undefined}><Icon size={16} />{name}</button>)}
      </nav>

      <div className="finance-month-picker"><span>Monthly view</span><input aria-label="Select finance month" type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} /></div>

      {panel === "Overview" && <>
        <div className="finance-stat-grid">
          <article className="finance-stat-card"><span><ArrowDownLeft size={16} /> Income</span><strong>{asMoney(income, data.currency)}</strong><small>This month</small></article>
          <article className="finance-stat-card"><span><ArrowUpRight size={16} /> Expenses</span><strong>{asMoney(expenses, data.currency)}</strong><small>This month</small></article>
          <article className="finance-stat-card"><span><Wallet size={16} /> Net cash flow</span><strong className={net < 0 ? "is-negative" : ""}>{asMoney(net, data.currency)}</strong><small>Income minus expenses</small></article>
          <article className="finance-stat-card"><span><TrendingUp size={16} /> Investments</span><strong>{asMoney(portfolioValue, data.currency)}</strong><small>Current overview</small></article>
        </div>

        <div className="finance-overview-grid">
          <article className="finance-card finance-analytics-card">
            <div className="finance-card-heading"><div><h3>Spending analytics</h3><p>Expenses by category</p></div><ChartNoAxesCombined size={18} /></div>
            {expensesByCategory.length ? <div className="finance-category-bars">{expensesByCategory.slice(0, 6).map(([category, amount]) => <div className="finance-category-row" key={category}><div><span>{category}</span><strong>{asMoney(amount, data.currency)}</strong></div><div className="finance-bar-track"><span style={{ width: `${Math.max(4, (amount / peakCategorySpend) * 100)}%` }} /></div></div>)}</div> : <div className="finance-empty-chart"><ChartNoAxesCombined size={23} /><p>Your spending breakdown will show here after you add expenses.</p></div>}
          </article>

          <article className="finance-card finance-budget-preview">
            <div className="finance-card-heading"><div><h3>Monthly budgets</h3><p>Keep spending within your plan</p></div><button type="button" className="finance-text-link" onClick={() => setPanel("Budgets")}>View all</button></div>
            {data.budgets.length ? data.budgets.slice(0, 4).map((budget) => {
              const spent = monthTransactions.filter((entry) => entry.kind === "expense" && entry.category.toLowerCase() === budget.category.toLowerCase()).reduce((sum, entry) => sum + entry.amount, 0);
              return <div className="finance-budget-row" key={budget.id}><div><span>{budget.category}</span><small>{asMoney(spent, data.currency)} of {asMoney(budget.limit, data.currency)}</small></div><div className="finance-bar-track"><span className={spent > budget.limit ? "is-over" : ""} style={{ width: `${Math.min(100, (spent / budget.limit) * 100)}%` }} /></div></div>;
            }) : <p className="finance-empty-copy">Add a monthly budget to keep an eye on category spending.</p>}
          </article>

          <article className="finance-card finance-transactions-preview">
            <div className="finance-card-heading"><div><h3>Recent activity</h3><p>Your latest income and expenses</p></div><button type="button" className="finance-text-link" onClick={() => setPanel("Transactions")}>View all</button></div>
            {monthTransactions.length ? monthTransactions.slice(0, 5).map((entry) => <div className="finance-activity-row" key={entry.id}><span className={cn("finance-activity-icon", entry.kind)}>{entry.kind === "income" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div><strong>{entry.title}</strong><small>{entry.category} · {entry.date}</small></div><b className={entry.kind}>{entry.kind === "income" ? "+" : "−"}{asMoney(entry.amount, data.currency)}</b></div>) : <p className="finance-empty-copy">No activity for this month. Add your first transaction below.</p>}
          </article>

          <article className="finance-card finance-goals-preview">
            <div className="finance-card-heading"><div><h3>Savings goals</h3><p>Small steps toward bigger plans</p></div><Target size={18} /></div>
            {data.goals.length ? data.goals.slice(0, 4).map((goal) => <div className="finance-goal-row" key={goal.id}><div><span>{goal.name}</span><small>{asMoney(goal.saved, data.currency)} of {asMoney(goal.target, data.currency)}</small></div><div className="finance-bar-track"><span style={{ width: `${Math.min(100, (goal.saved / goal.target) * 100)}%` }} /></div></div>) : <p className="finance-empty-copy">Create a savings goal to track your progress.</p>}
            <div className="finance-mini-stat"><CreditCard size={15} /><span>Subscriptions</span><strong>{asMoney(monthlySubscriptions, data.currency)}<small> / month</small></strong></div>
          </article>
        </div>

        <form className="finance-quick-form" onSubmit={addTransaction}>
          <div><strong>Add a transaction</strong><span>Income and expenses stay on this device.</span></div>
          <div className="finance-quick-fields"><select aria-label="Transaction type" value={transactionKind} onChange={(event) => setTransactionKind(event.target.value as Transaction["kind"])}><option value="expense">Expense</option><option value="income">Income</option></select><input value={transactionTitle} onChange={(event) => setTransactionTitle(event.target.value)} placeholder="What was it for?" maxLength={80} /><input value={transactionCategory} onChange={(event) => setTransactionCategory(event.target.value)} placeholder="Category" maxLength={32} /><input type="number" min="0.01" step="0.01" value={transactionAmount} onChange={(event) => setTransactionAmount(event.target.value)} placeholder="Amount" aria-label="Transaction amount" /><input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} aria-label="Transaction date" /><button type="submit" className="planit-primary-button" disabled={!transactionTitle.trim() || Number(transactionAmount) <= 0}><Plus size={16} /> Add</button></div>
        </form>
      </>}

      {panel === "Transactions" && <section className="finance-card finance-detail-card"><div className="finance-card-heading"><div><h3>Income and expenses</h3><p>Record the money moving in and out each month.</p></div></div><form className="finance-inline-form" onSubmit={addTransaction}><select aria-label="Transaction type" value={transactionKind} onChange={(event) => setTransactionKind(event.target.value as Transaction["kind"])}><option value="expense">Expense</option><option value="income">Income</option></select><input value={transactionTitle} onChange={(event) => setTransactionTitle(event.target.value)} placeholder="Description" maxLength={80} /><input value={transactionCategory} onChange={(event) => setTransactionCategory(event.target.value)} placeholder="Category" maxLength={32} /><input type="number" min="0.01" step="0.01" value={transactionAmount} onChange={(event) => setTransactionAmount(event.target.value)} placeholder="Amount" aria-label="Transaction amount" /><input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} aria-label="Transaction date" /><button type="submit" className="planit-primary-button" disabled={!transactionTitle.trim() || Number(transactionAmount) <= 0}><Plus size={16} /> Add transaction</button></form><div className="finance-list">{monthTransactions.length ? monthTransactions.map((entry) => <div className="finance-list-row" key={entry.id}><span className={cn("finance-activity-icon", entry.kind)}>{entry.kind === "income" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div><strong>{entry.title}</strong><small>{entry.category} · {entry.date}</small></div><b className={entry.kind}>{entry.kind === "income" ? "+" : "−"}{asMoney(entry.amount, data.currency)}</b><button type="button" onClick={() => remove("transactions", entry.id)} aria-label={`Delete ${entry.title}`}><Trash2 size={15} /></button></div>) : <p className="finance-empty-copy">No transactions recorded for this month yet.</p>}</div></section>}

      {panel === "Budgets" && <section className="finance-card finance-detail-card"><div className="finance-card-heading"><div><h3>Monthly budgets</h3><p>Set a spending limit by category. Progress updates as you add expenses.</p></div></div><form className="finance-inline-form" onSubmit={addBudget}><input value={budgetName} onChange={(event) => setBudgetName(event.target.value)} placeholder="Category (e.g. Groceries)" maxLength={40} /><input type="number" min="0.01" step="0.01" value={budgetLimit} onChange={(event) => setBudgetLimit(event.target.value)} placeholder="Monthly limit" aria-label="Monthly budget limit" /><button type="submit" className="planit-primary-button" disabled={!budgetName.trim() || Number(budgetLimit) <= 0}><Plus size={16} /> Add budget</button></form><div className="finance-budget-list">{data.budgets.length ? data.budgets.map((budget) => { const spent = monthTransactions.filter((entry) => entry.kind === "expense" && entry.category.toLowerCase() === budget.category.toLowerCase()).reduce((sum, entry) => sum + entry.amount, 0); return <div className="finance-budget-row" key={budget.id}><div><span>{budget.category}</span><small>{asMoney(spent, data.currency)} spent · {asMoney(budget.limit, data.currency)} limit</small><button type="button" onClick={() => remove("budgets", budget.id)} aria-label={`Delete ${budget.category} budget`}><Trash2 size={14} /></button></div><div className="finance-bar-track"><span className={spent > budget.limit ? "is-over" : ""} style={{ width: `${Math.min(100, (spent / budget.limit) * 100)}%` }} /></div></div>; }) : <p className="finance-empty-copy">Your category budgets will appear here.</p>}</div></section>}

      {panel === "Subscriptions" && <section className="finance-card finance-detail-card"><div className="finance-card-heading"><div><h3>Subscriptions</h3><p>Track recurring costs and see their monthly equivalent.</p></div><div className="finance-total-pill">{asMoney(monthlySubscriptions, data.currency)}<small> / month</small></div></div><form className="finance-inline-form" onSubmit={addSubscription}><input value={subscriptionName} onChange={(event) => setSubscriptionName(event.target.value)} placeholder="Service name" maxLength={60} /><input type="number" min="0.01" step="0.01" value={subscriptionAmount} onChange={(event) => setSubscriptionAmount(event.target.value)} placeholder="Cost" aria-label="Subscription cost" /><select aria-label="Subscription billing cycle" value={subscriptionCycle} onChange={(event) => setSubscriptionCycle(event.target.value as Subscription["cycle"])}><option>Monthly</option><option>Yearly</option></select><input type="date" value={subscriptionNextDate} onChange={(event) => setSubscriptionNextDate(event.target.value)} aria-label="Next subscription billing date" /><button type="submit" className="planit-primary-button" disabled={!subscriptionName.trim() || Number(subscriptionAmount) <= 0}><Plus size={16} /> Add subscription</button></form><div className="finance-list">{data.subscriptions.length ? data.subscriptions.map((item) => <div className="finance-list-row" key={item.id}><span className="finance-activity-icon subscription"><CreditCard size={16} /></span><div><strong>{item.name}</strong><small>{item.cycle} · Next: {item.nextDate}</small></div><b>{asMoney(item.amount, data.currency)}<small> / {item.cycle === "Yearly" ? "yr" : "mo"}</small></b><button type="button" onClick={() => remove("subscriptions", item.id)} aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button></div>) : <p className="finance-empty-copy">No subscriptions yet. Add recurring costs to keep track of them.</p>}</div></section>}

      {panel === "Savings" && <section className="finance-card finance-detail-card"><div className="finance-card-heading"><div><h3>Savings goals</h3><p>Name a goal, set a target, and add contributions as you save.</p></div></div><form className="finance-inline-form" onSubmit={addGoal}><input value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="Goal name" maxLength={60} /><input type="number" min="0.01" step="0.01" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} placeholder="Target amount" aria-label="Savings goal target" /><button type="submit" className="planit-primary-button" disabled={!goalName.trim() || Number(goalTarget) <= 0}><Plus size={16} /> Add goal</button></form><div className="finance-goals-list">{data.goals.length ? data.goals.map((goal) => <div className="finance-goal-card" key={goal.id}><div className="finance-goal-row"><div><span>{goal.name}</span><small>{asMoney(goal.saved, data.currency)} saved · {asMoney(goal.target, data.currency)} target</small></div><button type="button" onClick={() => remove("goals", goal.id)} aria-label={`Delete ${goal.name}`}><Trash2 size={14} /></button></div><div className="finance-bar-track"><span style={{ width: `${Math.min(100, (goal.saved / goal.target) * 100)}%` }} /></div><form onSubmit={(event) => { event.preventDefault(); const amount = Number(new FormData(event.currentTarget).get("contribution")); if (amount > 0) setData((current) => ({ ...current, goals: current.goals.map((item) => item.id === goal.id ? { ...item, saved: item.saved + amount } : item) })); event.currentTarget.reset(); }}><input name="contribution" type="number" min="0.01" step="0.01" placeholder="Add a contribution" aria-label={`Contribution to ${goal.name}`} /><button type="submit" className="finance-text-link">Add funds</button></form></div>) : <p className="finance-empty-copy">Your savings goals will appear here.</p>}</div></section>}

      {panel === "Investments" && <section className="finance-card finance-detail-card"><div className="finance-card-heading"><div><h3>Investments overview</h3><p>A simple snapshot of the assets you choose to track.</p></div><div className="finance-total-pill">{asMoney(portfolioValue, data.currency)}<small> total value</small></div></div><form className="finance-inline-form" onSubmit={addInvestment}><input value={investmentName} onChange={(event) => setInvestmentName(event.target.value)} placeholder="Asset or account" maxLength={60} /><input value={investmentType} onChange={(event) => setInvestmentType(event.target.value)} placeholder="Type (e.g. Index fund)" maxLength={40} /><input type="number" min="0" step="0.01" value={investmentValue} onChange={(event) => setInvestmentValue(event.target.value)} placeholder="Current value" aria-label="Investment current value" /><button type="submit" className="planit-primary-button" disabled={!investmentName.trim() || investmentValue === "" || Number(investmentValue) < 0}><Plus size={16} /> Add asset</button></form><div className="finance-list">{data.investments.length ? data.investments.map((item) => <div className="finance-list-row" key={item.id}><span className="finance-activity-icon investment"><BriefcaseBusiness size={16} /></span><div><strong>{item.name}</strong><small>{item.type}</small></div><b>{asMoney(item.value, data.currency)}</b><button type="button" onClick={() => remove("investments", item.id)} aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button></div>) : <p className="finance-empty-copy">Add assets to see a simple overview of your investments.</p>}</div><p className="finance-local-disclaimer">Values are entered by you and are not live market prices.</p></section>}

      <p className="finance-privacy-note"><Wallet size={14} /> Your finance data is saved in this browser on this device.</p>
    </section>
  );
}
