import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCrews } from '@/entities/crew'
import { applyFilter, CrewFilter, emptyFilter } from '@/features/crew-filter'
import { ANALYTICS_EVENTS, useTrackView } from '@/shared/lib/analytics'
import { messageOf } from '@/shared/lib/errorMessages'
import { can, PERMISSIONS } from '@/shared/auth/permissions'
import { CrewList } from '@/widgets/crew-list'
import { formatCrewStamp } from '../lib/format'

export function CrewsPage() {
  const { t } = useTranslation()
  const { data: crews, isPending, isError, errorCode, retry } = useCrews()
  const [keywords, setKeywords] = useState(emptyFilter.keywords)
  useTrackView(ANALYTICS_EVENTS.crewsView)
  return (
    <section>
      <h2>{t('crews.title')}</h2>
      {/* 加载 / 失败是一等状态：`data ?? []` 会让 500 与"确实没有数据"长得一样 */}
      {isPending ? <p>{t('common.loading')}</p> : null}
      {isError ? (
        <p>
          {/* 错误码 → 文案只走一处（`shared/lib/errorCopy`）：页面不碰 `err.code` */}
          {t(messageOf(errorCode))}
          <button type="button" onClick={retry}>
            {t('common.retry')}
          </button>
        </p>
      ) : null}
      {can(PERMISSIONS.crewEdit) ? <p>{t('crews.editHint')}</p> : null}
      <p>{formatCrewStamp()}</p>
      <CrewFilter value={keywords} onChange={setKeywords} />
      <CrewList crews={applyFilter(crews, keywords)} />
    </section>
  )
}
