import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const COLORS = ['#0d9488', '#0369a1', '#ca8a04', '#dc2626', '#7c3aed', '#059669', '#ea580c', '#64748b'];

export function TrendLineChart({
  data,
  dataKey = 'value',
  color = '#0d9488',
  height = 220,
}: {
  data: Array<Record<string, string | number>>;
  dataKey?: string;
  color?: string;
  height?: number;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendAreaChart({
  data,
  dataKey = 'value',
  color = '#0369a1',
  height = 220,
}: {
  data: Array<Record<string, string | number>>;
  dataKey?: string;
  color?: string;
  height?: number;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NamedBarChart({
  data,
  height = 240,
}: {
  data: Array<{ name: string; value: number }>;
  height?: number;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" fill="#0d9488" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({
  data,
  height = 240,
}: {
  data: Array<{ name: string; value: number }>;
  height?: number;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FunnelBars({
  steps,
}: {
  steps: Array<{ name: string; value: number }>;
}) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.name}>
          <div className="flex justify-between text-xs mb-1">
            <span>{s.name}</span>
            <span className="text-muted-foreground">{s.value}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-600"
              style={{ width: `${Math.max(4, (s.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
