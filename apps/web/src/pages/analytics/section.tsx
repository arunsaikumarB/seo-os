import { useParams } from 'react-router-dom';
import { AnalyticsDashboardPage } from './overview';

export function AnalyticsSectionPage() {
  const { section = 'seo' } = useParams();
  return <AnalyticsDashboardPage dashboardKey={section} />;
}
