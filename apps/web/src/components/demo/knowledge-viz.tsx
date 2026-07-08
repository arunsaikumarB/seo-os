import { motion } from 'framer-motion';
import { BookOpen, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedProgress } from './animated-progress';
import { DEMO_KB_DOCUMENTS } from '@/demo/data';

export function KnowledgeEngineViz() {
  const totalChunks = DEMO_KB_DOCUMENTS.reduce((s, d) => s + d.chunks, 0);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> Knowledge Engine
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Documents indexed</span>
          <span className="font-semibold">{DEMO_KB_DOCUMENTS.length}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total chunks</span>
          <span className="font-semibold">{totalChunks}</span>
        </div>
        <AnimatedProgress value={100} />
        <div className="space-y-1.5 pt-1">
          {DEMO_KB_DOCUMENTS.slice(0, 3).map((doc, i) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-2 text-xs rounded-md border px-2 py-1.5"
            >
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="truncate flex-1">{doc.title}</span>
              <span className="text-muted-foreground">{doc.chunks} chunks</span>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
