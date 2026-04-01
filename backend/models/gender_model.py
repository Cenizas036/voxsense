import torch
import torch.nn as nn
from backend.models.cnn_backbone import CNNBackbone


class GenderModel(nn.Module):

    def __init__(self):
        super(GenderModel, self).__init__()

        self.backbone = CNNBackbone()

        self.embedding = nn.Sequential(
            nn.Linear(self.backbone.flatten_size, 256),
            nn.ReLU()
        )

        self.classifier = nn.Sequential(
            nn.Dropout(0.5),
            nn.Linear(256, 2)
        )

    def forward(self, x, return_embedding=False):

        features = self.backbone(x)

        emb = self.embedding(features)

        output = self.classifier(emb)

        if return_embedding:
            return output, emb

        return output