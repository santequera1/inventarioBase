import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Copy, ExternalLink, Eye, MessageCircle, ShoppingBag } from "lucide-react";
import { Page, PageHeader } from "@/components/app/page";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useCatalogs } from "@/lib/queries";
import { catalogUrl, copyCatalogLink, formatPhone, shareCatalogOnWhatsapp } from "./share";

export default function CatalogsListPage() {
  const catalogs = useCatalogs();
  const { can } = useAuth();
  const navigate = useNavigate();
  const canWrite = can("products.write");

  return (
    <Page>
      <PageHeader
        title="Catálogos"
        subtitle="Comparte tus productos con un enlace. Tus clientes arman el carrito y el pedido llega a WhatsApp."
        primaryAction={canWrite ? <Button asChild variant="primary"><Link to="/catalogos/nuevo">Crear catálogo</Link></Button> : undefined}
      />
      {catalogs.isError ? (
        <ErrorState error={catalogs.error} onRetry={() => catalogs.refetch()} />
      ) : catalogs.isLoading ? (
        <div className="surface"><TableSkeleton rows={3} cols={3} /></div>
      ) : !catalogs.data?.length ? (
        <div className="surface">
          <EmptyState
            icon={<BookOpen />}
            title="Crea tu primer catálogo"
            description="Elige qué productos mostrar, comparte el enlace y recibe los pedidos ya detallados en WhatsApp."
            action={canWrite ? <Button asChild variant="primary"><Link to="/catalogos/nuevo">Crear catálogo</Link></Button> : undefined}
          />
        </div>
      ) : (
        <ul className="grid gap-3">
          {catalogs.data.map((c) => (
            <li key={c.id} className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <button type="button" className="min-w-0 text-left" onClick={() => navigate(`/catalogos/${c.id}`)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold hover:underline">{c.name}</span>
                  <Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Publicado" : "Oculto"}</Badge>
                  {c.allProducts ? <Badge tone="info">Todos los productos</Badge> : null}
                </div>
                <div className="mt-1 truncate text-sm text-muted-foreground">{catalogUrl(c.slug)}</div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><ShoppingBag className="h-3.5 w-3.5" />{c.productCount} productos</span>
                  <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{c.views} visitas</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{c.inquiryCount} pedidos · {formatPhone(c.whatsappPhone)}</span>
                </div>
              </button>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => copyCatalogLink(c.slug)}><Copy />Copiar enlace</Button>
                <Button size="sm" variant="secondary" onClick={() => shareCatalogOnWhatsapp(c.name, c.slug)}><MessageCircle />Compartir</Button>
                <Button size="sm" variant="ghost" asChild><a href={catalogUrl(c.slug)} target="_blank" rel="noreferrer"><ExternalLink />Ver</a></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
