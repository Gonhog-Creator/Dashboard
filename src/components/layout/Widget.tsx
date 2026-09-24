import { ReactNode } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Widget({
  title,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      {title && (
        <CardHeader className="items-center space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn("flex-1", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
